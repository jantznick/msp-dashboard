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

// Import Routers
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const intakeRoutes = require('./routes/intake');
const apiRoutes = require('./routes/api');
const docsRoutes = require('./routes/docs');


// Mount Routers
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/intake', intakeRoutes);
app.use('/api', apiRoutes);
app.use('/docs', docsRoutes);


app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
});