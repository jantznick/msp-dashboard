require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const fs = require('fs');
const { marked } = require('marked');
const session = require('express-session');
const { PrismaSessionStore } = require('@quixo3/prisma-session-store');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 5555;

const JIRA_PROJECTS = {
  "TC": "Tool-Catalog",
  "SEC": "Security Projects",
  "DEVOPS": "DevOps"
};

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware setup
app.use(
    session({
        store: new PrismaSessionStore(
            prisma,
            {
                checkPeriod: 2 * 60 * 1000, // ms
                dbRecordIdIsSessionId: true,
                dbRecordIdFunction: undefined,
            }
        ),
        secret: process.env.SESSION_SECRET || 'fallback-secret',
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
        }
    })
);

// Middleware to make user and session info available to all templates
app.use(async (req, res, next) => {
    if (req.session.user) {
        res.locals.user = req.session.user;
        const adminDomains = (process.env.ADMIN_DOMAINS || '').split(',');
        const userEmailDomain = req.session.user.email.substring(req.session.user.email.lastIndexOf("@") + 1);
        res.locals.isAdmin = adminDomains.includes(userEmailDomain);
    } else {
        res.locals.user = null;
        res.locals.isAdmin = false;
    }
    next();
});


// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
};

// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    const adminDomains = (process.env.ADMIN_DOMAINS || '').split(',');
    const userEmailDomain = req.session.user.email.substring(req.session.user.email.lastIndexOf("@") + 1);
    
    if (!adminDomains.includes(userEmailDomain)) {
        return res.redirect('/');
    }
    next();
};


// Routes
app.get('/', (req, res) => {
    res.render('home', { title: 'Home' });
});

// A map to associate slugs with product names and markdown files
const productMap = {
    'fastly-ngwaf': { name: 'Fastly NGWAF', file: 'fastly-ngwaf.md' },
    'snyk': { name: 'Snyk', file: 'snyk.md' },
    'tenable-was': { name: 'Tenable WAS', file: 'tenable-was.md' },
    'traceable-api-security': { name: 'Traceable API Security', file: 'traceable-api-security.md' }
};

app.get('/products/:slug', async (req, res) => {
    const slug = req.params.slug;
    const product = productMap[slug];

    if (!product) {
        return res.status(404).send('Product not found');
    }

    let applications = [];
    if (req.session.user) {
        const user = await prisma.user.findUnique({
            where: { id: req.session.user.id },
            include: { company: { include: { applications: true } } }
        });
        if (user && user.company) {
            applications = user.company.applications;
        }
    }

    const filePath = path.join(__dirname, 'content/products', product.file);
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error reading product content');
        }
        const content = marked(data);
        res.render('product-detail', {
            title: product.name,
            productName: product.name,
            content: content,
            applications,
            submitted: req.query.submitted
        });
    });
});

app.get('/add-users', async (req, res) => {
    let applications = [];
    if (req.session.user) {
        const user = await prisma.user.findUnique({
            where: { id: req.session.user.id },
            include: { company: { include: { applications: true } } }
        });
        if (user && user.company) {
            applications = user.company.applications;
        }
    }
    res.render('add-users', { title: 'Add Users to a Tool', applications, submitted: req.query.submitted });
});

app.get('/request', async (req, res) => {
    let applications = [];
    if (req.session.user) {
        const user = await prisma.user.findUnique({
            where: { id: req.session.user.id },
            include: { company: { include: { applications: true } } }
        });
        if (user && user.company) {
            applications = user.company.applications;
        }
    }
    res.render('request', { title: 'Request a Tool', applications, submitted: req.query.submitted });
});

app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            include: {
                scriptJobs: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                User: true,
                application: {
                    include: {
                        company: true
                    }
                }
            },
            orderBy: {
                timestamp: 'desc'
            }
        });
        res.render('admin', {
            title: 'Admin Dashboard',
            user: req.session.user,
            requests: requests,
            jiraProjects: JIRA_PROJECTS,
            initialData: JSON.stringify({ requests, jiraProjects: JIRA_PROJECTS }) 
        });
    } catch (error) {
        console.error('Error fetching requests for admin:', error);
        res.status(500).send("Error fetching requests");
    }
});

// Admin management routes
app.get('/admin/companies', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            orderBy: { name: 'asc' }
        });
        res.render('admin/companies', { title: 'Manage Companies', companies });
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).send("Error fetching companies");
    }
});

app.post('/admin/companies', isAuthenticated, isAdmin, async (req, res) => {
    const { name, domains } = req.body;
    try {
        const newCompany = await prisma.company.create({
            data: { name, domains }
        });

        // Retroactively assign users
        if (domains) {
            const domainList = domains.split(',').map(d => d.trim());
            for (const domain of domainList) {
                await prisma.user.updateMany({
                    where: {
                        email: { endsWith: '@' + domain },
                        companyId: null
                    },
                    data: { companyId: newCompany.id }
                });
            }
        }

        res.redirect('/admin/companies');
    } catch (error) {
        console.error('Error creating company:', error);
        // You might want to render the page again with an error message
        res.status(500).send("Error creating company");
    }
});

app.post('/admin/companies/:id/update', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const updatedCompany = await prisma.company.update({
            where: { id: req.params.id },
            data: {
                name: req.body.name,
                domains: req.body.domains
            }
        });

        // Retroactively assign users
        if (req.body.domains) {
            const domainList = req.body.domains.split(',').map(d => d.trim());
            for (const domain of domainList) {
                await prisma.user.updateMany({
                    where: {
                        email: { endsWith: `@${domain}` },
                        companyId: null
                    },
                    data: { companyId: updatedCompany.id }
                });
            }
        }

        res.redirect('/admin/companies');
    } catch (error) {
        console.error(`Error updating company ${req.params.id}:`, error);
        res.status(500).send("Error updating company");
    }
});

app.get('/admin/applications', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const applications = await prisma.application.findMany({
            include: { company: true },
            orderBy: { name: 'asc' }
        });
        const companies = await prisma.company.findMany({
            orderBy: { name: 'asc' }
        });
        res.render('admin/applications', { title: 'Manage Applications', applications, companies });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).send("Error fetching applications");
    }
});

app.post('/admin/applications', isAuthenticated, isAdmin, async (req, res) => {
    const { name, companyId, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    try {
        await prisma.application.create({
            data: {
                name,
                companyId,
                description,
                owner,
                repoUrl,
                language,
                framework,
                serverEnvironment,
                facing,
                deploymentType,
                authProfiles,
                dataTypes
            }
        });
        res.redirect('/admin/applications');
    } catch (error) {
        console.error('Error creating application:', error);
        res.status(500).send("Error creating application");
    }
});

app.post('/admin/applications/:id/update', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const updatedApplication = await prisma.application.update({
            where: { id: req.params.id },
            data: {
                name: req.body.name,
                companyId: req.body.companyId,
                description: req.body.description,
                owner: req.body.owner,
                repoUrl: req.body.repoUrl,
                language: req.body.language,
                framework: req.body.framework,
                serverEnvironment: req.body.serverEnvironment,
                facing: req.body.facing,
                deploymentType: req.body.deploymentType,
                authProfiles: req.body.authProfiles,
                dataTypes: req.body.dataTypes
            }
        });
        res.redirect('/admin/applications');
    } catch (error) {
        console.error(`Error updating application ${req.params.id}:`, error);
        res.status(500).send("Error updating application");
    }
});

app.post('/api/applications/:id/update', isAuthenticated, async (req, res) => {
    const appId = req.params.id;
    const { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
        const application = await prisma.application.findUnique({ where: { id: appId } });

        // Security check: User must be an admin OR belong to the same company as the application
        const isAdmin = res.locals.isAdmin;
        const isOwner = user && application && user.companyId === application.companyId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: "You do not have permission to edit this application." });
        }

        const updatedApplication = await prisma.application.update({
            where: { id: appId },
            data: { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes },
            include: { company: true } // Include company to send back full data
        });
        res.json(updatedApplication);
    } catch (error) {
        console.error(`Error updating application ${appId} by user ${req.session.user.id}:`, error);
        res.status(500).json({ error: "Error updating application" });
    }
});

app.get('/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: { company: true },
            orderBy: { email: 'asc' }
        });
        const companies = await prisma.company.findMany({
            orderBy: { name: 'asc' }
        });
        res.render('admin/users', { title: 'Manage Users', users, companies });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).send("Error fetching users");
    }
});

app.post('/admin/users/:id/update', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: {
                companyId: req.body.companyId || null
            }
        });
        res.redirect('/admin/users');
    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
        res.status(500).send("Error updating user");
    }
});


app.get('/api/requests', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            include: {
                scriptJobs: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                },
                User: true,
                application: {
                    include: {
                        company: true
                    }
                }
            },
            orderBy: {
                timestamp: 'desc'
            }
        });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests API:', error);
        res.status(500).json({ error: 'Failed to fetch requests.' });
    }
});

app.post('/admin/notes/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { adminNotes } = req.body;
        const requestId = parseInt(req.params.id, 10);
        await prisma.request.update({
            where: { id: requestId },
            data: { adminNotes: adminNotes }
        });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to update admin notes.');
    }
});

app.get('/my-requests', isAuthenticated, async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            where: {
                userId: req.session.user.id
            },
            orderBy: {
                timestamp: 'desc'
            },
            include: {
                scriptJobs: {
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });
        res.render('my-requests', {
            title: 'My Requests',
            requests: requests,
            user: req.session.user
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching requests");
    }
});

app.get('/my-applications', isAuthenticated, async (req, res) => {
    if (res.locals.isAdmin) {
        return res.redirect('/admin/applications');
    }
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.session.user.id },
            include: {
                company: {
                    include: {
                        applications: true
                    }
                }
            }
        });

        if (user && user.company) {
            res.render('my-applications', {
                title: 'My Applications',
                company: user.company,
                applications: user.company.applications
            });
        } else {
            res.render('my-applications', {
                title: 'My Applications',
                company: null,
                applications: []
            });
        }
    } catch (error) {
        console.error('Error fetching user applications:', error);
        res.status(500).send("Error fetching applications");
    }
});

app.post('/my-applications/add', isAuthenticated, async (req, res) => {
    const { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    try {
        if (!req.session.user.companyId) {
            return res.status(403).send("You are not associated with a company.");
        }
        await prisma.application.create({
            data: {
                name,
                companyId: req.session.user.companyId,
                description,
                owner,
                repoUrl,
                language,
                framework,
                serverEnvironment,
                facing,
                deploymentType,
                authProfiles,
                dataTypes
            }
        });
        res.redirect('/my-applications');
    } catch (error) {
        console.error(`Error adding application for company ${req.session.user.companyId}:`, error);
        res.status(500).send("Error adding application");
    }
});

app.post('/request', async (req, res) => {
    try {
        const { email, product, products, requestType, users, notes, applicationId } = req.body;

        // Determine which products to save. Can come from a single-product page or a multi-product form.
        let productsData = product; // From product-detail form (name="product")
        if (products) { // From request or add-users form (name="products")
            productsData = Array.isArray(products) ? products.join(', ') : products;
        }

        let requestUser = null;
        let userEmail = email;

        if (req.session.user) {
            // User is logged in
            requestUser = await prisma.user.findUnique({ where: { id: req.session.user.id } });
            userEmail = requestUser.email;
        } else {
            // Guest user, find or create a temporary reference
            requestUser = await prisma.user.findUnique({ where: { email: userEmail } });
        }
        
        const newRequest = await prisma.request.create({
            data: {
                product: productsData || 'N/A',
                requestType,
                users,
                notes,
                userId: requestUser ? requestUser.id : null,
                applicationId: applicationId ? parseInt(applicationId, 10) : null
            }
        });
        
        const transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            subject: 'New AppSec Tool Request',
            html: `<h1>New Tool Request</h1><p><strong>Requestor Email:</strong> ${userEmail}</p><p><strong>Product:</strong> ${productsData || 'N/A'}</p><p><strong>Request Type:</strong> ${requestType}</p><p><strong>Users:</strong> ${users || 'N/A'}</p><p><strong>Notes:</strong> ${notes || 'N/A'}</p>`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return console.log(error);
            }
            console.log('Email sent: ' + info.response);
        });

        // Redirect based on where the form was submitted from
        const referer = req.get('Referer');
        let redirectUrl = '/request?submitted=true';
        if (referer) {
            if (referer.includes('/products/')) {
                redirectUrl = referer.split('?')[0] + '?submitted=true';
            } else if (referer.includes('/add-users')) {
                redirectUrl = '/add-users?submitted=true';
            }
        }
        res.redirect(redirectUrl);
    } catch (error) {
        console.error(error);
        res.status(400).send("Error processing request");
    }
});

app.post('/api/create-jira-ticket', isAuthenticated, isAdmin, async (req, res) => {
  const { requestId, jiraProjectKey } = req.body;

  if (!requestId || !jiraProjectKey) {
    return res.status(400).json({ error: 'Missing request ID or Jira project key.' });
  }

  try {
    const requestDetails = await prisma.request.findUnique({
      where: { id: parseInt(requestId, 10) },
      include: { User: true, application: { include: { company: true } } }
    });

    if (!requestDetails) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    
    const { JIRA_HOST, JIRA_USER_EMAIL, JIRA_API_TOKEN } = process.env;

    if (!JIRA_HOST || !JIRA_USER_EMAIL || !JIRA_API_TOKEN) {
      return res.status(500).json({ error: 'Jira environment variables are not configured on the server.' });
    }

    const jiraApiUrl = `https://${JIRA_HOST}/rest/api/2/issue`;
    
    const ticketBody = {
      fields: {
        project: {
          key: jiraProjectKey
        },
        summary: `New AppSec Catalog Request: ${requestDetails.product}`,
        description: `A new tool request has been submitted.\n\n- Requestor: ${requestDetails.User ? requestDetails.User.email : 'N/A'}\n- Company: ${requestDetails.application && requestDetails.application.company ? requestDetails.application.company.name : 'N/A'}\n- Application: ${requestDetails.application ? requestDetails.application.name : 'N/A'}\n- Request Type: ${requestDetails.requestType}\n- Product: ${requestDetails.product}\n- Users: ${requestDetails.users || 'N/A'}\n- User Notes: ${requestDetails.notes || 'N/A'}\n- Admin Notes: ${requestDetails.adminNotes || 'N/A'}`,
        issuetype: {
          name: "Story" 
        }
      }
    };
    
    const auth = Buffer.from(`${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

    const response = await fetch(jiraApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ticketBody)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jira API Error: ${response.status} ${response.statusText}`, errorBody);
      return res.status(response.status).json({ error: `Jira API responded with status ${response.status}.`, details: errorBody });
    }

    const jiraResponse = await response.json();
    const ticketUrl = `https://${JIRA_HOST}/browse/${jiraResponse.key}`;
    
    await prisma.request.update({
        where: { id: parseInt(requestId, 10) },
        data: { status: 'IN_PROGRESS' }
    });
    
    res.json({
      message: 'Jira ticket created successfully!',
      ticketUrl: ticketUrl,
      ticketKey: jiraResponse.key
    });

  } catch (error) {
    console.error('Error creating Jira ticket:', error);
    res.status(500).json({ error: 'An internal server error occurred while creating the Jira ticket.' });
  }
});

app.post('/api/requests/:id/status', isAuthenticated, isAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  try {
    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { status: status },
    });
    res.json(updatedRequest);
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

app.post('/api/requests/:id/notes', isAuthenticated, isAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { adminNotes } = req.body;

  if (typeof adminNotes === 'undefined') {
    return res.status(400).json({ error: 'adminNotes field is required.' });
  }

  try {
    const updatedRequest = await prisma.request.update({
      where: { id: requestId },
      data: { adminNotes: adminNotes },
    });
    res.json(updatedRequest);
  } catch (error) {
    console.error('Error updating admin notes:', error);
    res.status(500).json({ error: 'Failed to update admin notes.' });
  }
});

app.post('/api/run-script', isAuthenticated, isAdmin, async (req, res) => {
    const { scriptName, args, requestId } = req.body;

    if (!scriptName || !Array.isArray(args) || !requestId) {
        return res.status(400).json({ error: 'scriptName, args array, and requestId are required.' });
    }

    // --- Security Validation ---
    const sanitizedScriptName = path.basename(scriptName);
    if (sanitizedScriptName !== scriptName) {
        return res.status(400).json({ error: 'Invalid script name.' });
    }
    
    const scriptDir = path.join(__dirname, 'scripts');
    const scriptPath = path.join(scriptDir, sanitizedScriptName);
    const logsDir = path.join(__dirname, 'logs');
    fs.mkdirSync(logsDir, { recursive: true }); // Ensure logs directory exists

    if (!scriptPath.startsWith(scriptDir) || path.extname(scriptPath) !== '.py') {
        return res.status(400).json({ error: 'Invalid script path. Only .py scripts are allowed.' });
    }
    
    try {
        const logFile = `${Date.now()}-${requestId}-${sanitizedScriptName}.log`;
        const logFilePath = path.join(logsDir, logFile);

        const job = await prisma.scriptJob.create({
            data: {
                requestId: requestId,
                scriptName: sanitizedScriptName,
                status: 'RUNNING',
                logFile: logFile
            }
        });

        res.status(202).json(job); // Respond immediately

        // --- Run script in the background ---
        const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
        const scriptProcess = spawn('python3', [scriptPath, ...args]);
        
        scriptProcess.stdout.pipe(logStream);
        scriptProcess.stderr.pipe(logStream);

        scriptProcess.on('close', async (code) => {
            const finalStatus = code === 0 ? 'COMPLETED' : 'FAILED';
            await prisma.scriptJob.update({
                where: { id: job.id },
                data: {
                    status: finalStatus,
                    completedAt: new Date(),
                }
            });
            if (finalStatus === 'COMPLETED') {
                await prisma.request.update({
                    where: { id: job.requestId },
                    data: { status: 'COMPLETED' }
                });
            }
            logStream.end();
        });

        scriptProcess.on('error', async (err) => {
            console.error('Failed to start script process.', err);
            logStream.write(`\n--- FAILED TO START SCRIPT: ${err.message} ---\n`);
            await prisma.scriptJob.update({
                where: { id: job.id },
                data: { status: 'FAILED', completedAt: new Date() }
            });
            logStream.end();
        });

    } catch (error) {
        console.error("Error creating script job:", error);
        res.status(500).json({ error: "Failed to create script job."});
    }
});

app.get('/api/jobs/:id', isAuthenticated, isAdmin, async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    try {
        const job = await prisma.scriptJob.findUnique({ where: { id: jobId }});
        if (!job) {
            return res.status(404).json({ error: 'Job not found.'});
        }
        
        const logsDir = path.join(__dirname, 'logs');
        const logFilePath = path.join(logsDir, job.logFile);

        let logContent = `Job Status: ${job.status}\n--- Logs ---\n`;
        if (fs.existsSync(logFilePath)) {
            logContent += fs.readFileSync(logFilePath, 'utf-8');
        } else {
            logContent += 'Log file not found.';
        }
        
        res.json({
            status: job.status,
            logContent: logContent
        });

    } catch (error) {
        console.error(`Error fetching job ${jobId}:`, error);
        res.status(500).json({ error: 'Failed to fetch job status.' });
    }
});


// Auth Routes
app.get('/login', (req, res) => {
    res.render('login', { title: 'Login', error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = { id: user.id, email: user.email };
            res.redirect('/');
        } else {
            res.render('login', { title: 'Login', error: 'Invalid email or password' });
        }
    } catch (error) {
        res.render('login', { title: 'Login', error: 'An error occurred' });
    }
});

app.get('/register', (req, res) => {
    res.render('register', { title: 'Register', error: null });
});

app.post('/register', async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
        return res.render('register', { title: 'Register', error: 'Passwords do not match' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // Auto-assign company based on email domain
        const userEmailDomain = email.substring(email.lastIndexOf("@") + 1);
        let companyId = null;

        const companies = await prisma.company.findMany({
            where: { domains: { contains: userEmailDomain } }
        });
        
        // Find a company where the domain is an exact match in the comma-separated list
        const matchingCompany = companies.find(c => 
            c.domains.split(',').map(d => d.trim()).includes(userEmailDomain)
        );

        if (matchingCompany) {
            companyId = matchingCompany.id;
        }

        const user = await prisma.user.create({
            data: { 
                email, 
                password: hashedPassword,
                companyId: companyId
            }
        });
        req.session.user = { id: user.id, email: user.email };
        res.redirect('/');
    } catch (error) {
        if (error.code === 'P2002') { // Unique constraint violation
            return res.render('register', { title: 'Register', error: 'Email already in use' });
        }
        res.render('register', { title: 'Register', error: 'Error creating account' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/');
    });
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});