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

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 5555;

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
        const adminEmails = (process.env.ADMIN_EMAILS || '').split(',');
        res.locals.isAdmin = adminEmails.includes(req.session.user.email);
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
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',');
    if (!req.session.user || !adminEmails.includes(req.session.user.email)) {
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

app.get('/products/:slug', (req, res) => {
    const slug = req.params.slug;
    const product = productMap[slug];

    if (!product) {
        return res.status(404).send('Product not found');
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
            submitted: req.query.submitted
        });
    });
});

app.get('/add-users', (req, res) => {
    res.render('add-users', { title: 'Add Users to a Tool', submitted: req.query.submitted });
});

app.get('/request', (req, res) => {
    res.render('request', { title: 'Request a Tool', submitted: req.query.submitted });
});

app.get('/admin', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            orderBy: { timestamp: 'desc' }
        });
        res.render('admin', { title: 'Admin Dashboard', requests: requests });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching requests");
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
            where: { userId: req.session.user.id },
            orderBy: { timestamp: 'desc' }
        });
        res.render('my-requests', { title: 'My Requests', requests: requests });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching requests");
    }
});

app.post('/request', async (req, res) => {
    try {
        const { companyName, contactPerson, email, product, products, requestType, users, notes } = req.body;
        const source = req.get('Referer');

        // Determine which products to save. Can come from a single-product page or a multi-product form.
        let productsData = product; // From product-detail form (name="product")
        if (products) { // From request or add-users form (name="products")
            productsData = Array.isArray(products) ? products.join(', ') : products;
        }

        // Try to find an existing user by the provided email
        const user = await prisma.user.findUnique({
            where: { email }
        });

        const newRequest = await prisma.request.create({
            data: {
                companyName,
                contactPerson,
                email,
                product: productsData || 'N/A',
                requestType,
                users,
                notes,
                userId: user ? user.id : null
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
            html: `<h1>New Tool Request</h1><p><strong>Company:</strong> ${companyName}</p><p><strong>Contact:</strong> ${contactPerson} (${email})</p><p><strong>Product:</strong> ${productsData || 'N/A'}</p><p><strong>Request Type:</strong> ${requestType}</p><p><strong>Users:</strong> ${users || 'N/A'}</p><p><strong>Notes:</strong> ${notes || 'N/A'}</p>`
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
        const user = await prisma.user.create({
            data: { email, password: hashedPassword }
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