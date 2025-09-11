const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const nodemailer = require('nodemailer');
const { prisma } = require('../prisma/client');
const { isAuthenticated } = require('../middleware/auth');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Home page with products
router.get('/', async (req, res) => {
    try {
        const productsDir = path.join(__dirname, '..', 'content', 'products');
        const files = fs.readdirSync(productsDir);
        const products = files.map(file => {
            const content = fs.readFileSync(path.join(productsDir, file), 'utf-8');
            const { attributes } = parseFrontMatter(content);
            return {
                slug: file.replace('.md', ''),
                title: attributes.title || 'Untitled',
                summary: attributes.summary || ''
            };
        });
        res.render('home', { title: 'Home', products });
    } catch (error) {
        console.error('Error fetching products for homepage:', error);
        res.status(500).send('Error loading products');
    }
});

function parseFrontMatter(content) {
    const match = /---\n([\s\S]+?)\n---/.exec(content);
    const attributes = {};
    if (match) {
        match[1].split('\n').forEach(line => {
            const [key, ...valueParts] = line.split(':');
            if (key) {
                attributes[key.trim()] = valueParts.join(':').trim();
            }
        });
        const body = content.slice(match[0].length);
        return { attributes, body };
    }
    return { attributes: {}, body: content };
}

// Product detail page
router.get('/products/:slug', async (req, res) => {
    try {
        const filePath = path.join(__dirname, '..', 'content', 'products', `${req.params.slug}.md`);
        const markdown = fs.readFileSync(filePath, 'utf-8');
        const { attributes, body } = parseFrontMatter(markdown);
        const htmlContent = marked(body);

        let applications = [];
        if (req.session.user && req.session.user.companyId) {
            applications = await prisma.application.findMany({
                where: { companyId: req.session.user.companyId }
            });
        }
        
        res.render('product-detail', { 
            title: attributes.title || 'Product Detail', 
            product: { ...attributes, content: htmlContent, slug: req.params.slug },
            applications
        });
    } catch (error) {
        res.status(404).send('Product not found');
    }
});

// Request forms
router.get('/request', async (req, res) => {
    let applications = [];
    if (req.session.user && req.session.user.companyId) {
        applications = await prisma.application.findMany({
            where: { companyId: req.session.user.companyId }
        });
    }
    res.render('request', { title: 'Request a Tool', applications });
});

router.get('/add-users', async (req, res) => {
    let applications = [];
    if (req.session.user && req.session.user.companyId) {
        applications = await prisma.application.findMany({
            where: { companyId: req.session.user.companyId }
        });
    }
    res.render('add-users', { title: 'Add Users', applications });
});

// Handle form submissions
router.post('/request', async (req, res) => {
    const { products, requestType, users, notes, email, applicationId } = req.body;
    try {
        const finalEmail = req.session.user ? req.session.user.email : email;
        const requestData = {
            products: Array.isArray(products) ? products.join(', ') : products,
            requestType,
            users,
            notes,
            applicationId: req.session.user ? applicationId : null,
            userId: req.session.user ? req.session.user.id : null,
        };

        if (!req.session.user && email) {
            const existingUser = await prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                requestData.userId = existingUser.id;
            }
        }
        
        await prisma.request.create({ data: requestData });
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: finalEmail,
            subject: 'Tool Request Confirmation',
            html: `<p>Your request for the following tools has been received: ${requestData.products}.</p><p>We will get back to you shortly.</p>`
        };
        transporter.sendMail(mailOptions);

        res.render(requestType === 'Add Users' ? 'add-users' : 'request', { 
            title: 'Request Submitted', 
            applications: [],
            message: 'Your request has been submitted successfully!' 
        });
    } catch (error) {
        console.error('Error submitting request:', error);
        res.status(500).send('Error submitting request');
    }
});

// User-specific pages
router.get('/my-requests', isAuthenticated, async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            where: { userId: req.session.user.id },
            orderBy: { createdAt: 'desc' },
            include: { application: true }
        });
        res.render('my-requests', { title: 'My Requests', requests });
    } catch (error) {
        res.status(500).send('Error fetching requests');
    }
});

router.get('/my-applications', isAuthenticated, async (req, res) => {
    try {
        if (res.locals.isAdmin) {
            return res.redirect('/admin/applications');
        }
        if (!req.session.user.companyId) {
            return res.render('my-applications', { title: 'My Applications', applications: [], company: null });
        }
        const company = await prisma.company.findUnique({ where: { id: req.session.user.companyId } });
        const applications = await prisma.application.findMany({
            where: { companyId: req.session.user.companyId },
            orderBy: { name: 'asc' }
        });
        res.render('my-applications', { title: 'My Applications', applications, company });
    } catch (error) {
        res.status(500).send("Error fetching applications");
    }
});

router.post('/my-applications/add', isAuthenticated, async (req, res) => {
    const { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    try {
        if (!req.session.user.companyId) {
            return res.status(403).send("You are not associated with a company.");
        }
        await prisma.application.create({
            data: {
                name,
                companyId: req.session.user.companyId,
                description, owner, repoUrl, language, framework, serverEnvironment, 
                facing, deploymentType, authProfiles, dataTypes
            }
        });
        res.redirect('/my-applications');
    } catch (error) {
        console.error(`Error adding application for company ${req.session.user.companyId}:`, error);
        res.status(500).send("Error adding application");
    }
});


module.exports = router;
