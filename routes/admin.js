const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma/client');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Protect all admin routes
router.use(isAuthenticated, isAdmin);

// Admin Dashboard
router.get('/', async (req, res) => {
    try {
        const requests = await prisma.request.findMany({
            orderBy: { createdAt: 'desc' },
            include: { 
                User: true,
                application: {
                    include: {
                        company: true
                    }
                },
                scriptJobs: {
                    orderBy: {
                        startedAt: 'desc'
                    }
                }
            }
        });
        const JIRA_PROJECTS = {};
        for (let i = 1; process.env[`JIRA_PROJECT_KEY_${i}`]; i++) {
            JIRA_PROJECTS[process.env[`JIRA_PROJECT_KEY_${i}`]] = process.env[`JIRA_PROJECT_NAME_${i}`];
        }
        const initialData = { requests, jiraProjects: JIRA_PROJECTS };
        res.render('admin', { title: 'Admin Dashboard', initialData: JSON.stringify(initialData) });
    } catch (error) {
        console.error('Error fetching requests for admin:', error);
        res.status(500).send('Error fetching requests');
    }
});

// Manage Companies
router.get('/companies', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const companies = await prisma.company.findMany({
            orderBy: { name: 'asc' },
            include: {
                contacts: true,
                applications: {
                    include: {
                        contacts: true
                    }
                }
            }
        });
        res.render('admin/companies', {
            title: 'Manage Companies',
            companies: companies
        });
    } catch (error) {
        res.status(500).send("Error fetching companies");
    }
});

router.post('/companies/add', isAuthenticated, isAdmin, async (req, res) => {
    const { name, domains } = req.body;
    try {
        const company = await prisma.company.create({
            data: { name, domains }
        });

        if (domains) {
            const domainList = domains.split(',').map(d => d.trim()).filter(Boolean);
            if (domainList.length > 0) {
                const usersToUpdate = await prisma.user.findMany({
                    where: {
                        OR: domainList.map(domain => ({
                            email: { endsWith: `@${domain}` }
                        })),
                        companyId: null
                    }
                });

                for (const user of usersToUpdate) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { companyId: company.id }
                    });
                }
            }
        }
        res.redirect('/admin/companies');
    } catch (error) {
        res.status(500).send("Error creating company");
    }
});

router.post('/companies/:id/update', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const updatedCompany = await prisma.company.update({
            where: { id: req.params.id },
            data: { name: req.body.name, domains: req.body.domains }
        });
        if (req.body.domains) {
            const domainList = req.body.domains.split(',').map(d => d.trim());
            for (const domain of domainList) {
                await prisma.user.updateMany({
                    where: { email: { endsWith: '@' + domain }, companyId: null },
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

// Manage Applications
router.get('/applications', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const applications = await prisma.application.findMany({ 
            orderBy: { name: 'asc' },
            include: { 
                company: true,
                contacts: true
            }
        });
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('admin/applications', { title: 'Manage Applications', applications, companies });
    } catch (error) {
        res.status(500).send("Error fetching applications");
    }
});

router.post('/applications/add', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { name, companyId, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
        await prisma.application.create({
            data: {
                name, companyId, description, owner, repoUrl, language, framework, serverEnvironment, 
                facing, deploymentType, authProfiles, dataTypes
            }
        });
        res.redirect('/admin/applications');
    } catch (error) {
        res.status(500).send("Error creating application");
    }
});

router.post('/applications/:id/update', async (req, res) => {
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

// Manage Users
router.get('/users', async (req, res) => {
    try {
        const users = await prisma.user.findMany({ 
            include: { company: true },
            orderBy: { email: 'asc' }
        });
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('admin/users', { title: 'Manage Users', users, companies });
    } catch (error) {
        res.status(500).send("Error fetching users");
    }
});

router.post('/users/:id/update', async (req, res) => {
    try {
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: { companyId: req.body.companyId || null }
        });
        res.redirect('/admin/users');
    } catch (error) {
        console.error(`Error updating user ${req.params.id}:`, error);
        res.status(500).send("Error updating user");
    }
});

// Unauthorized Changes Log
router.get('/unauthorized-changes', async (req, res) => {
    try {
        const logs = await prisma.changeLog.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.render('admin/unauthorized_changes', { title: 'Unauthorized Changes', logs });
    } catch (error) {
        console.error('Error fetching change logs:', error);
        res.status(500).send("Error fetching change logs");
    }
});


module.exports = router;
