const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { prisma } = require('../prisma/client');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

// Protect all API routes
router.use(isAuthenticated);

// Get job status and logs
router.get('/jobs/:id', async (req, res) => {
    const jobId = parseInt(req.params.id);
    try {
        const job = await prisma.scriptJob.findUnique({ where: { id: jobId } });
        if (!job) return res.status(404).json({ error: 'Job not found' });

        res.json({ status: job.status, logContent: job.output });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching job status' });
    }
});

// Update request status
router.post('/requests/:id/status', isAdmin, async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { status } = req.body;
    try {
        await prisma.request.update({
            where: { id: requestId },
            data: { status },
        });
        res.sendStatus(200);
    } catch (error) {
        res.status(500).json({ error: 'Error updating status' });
    }
});

// Update request notes
router.post('/requests/:id/notes', isAdmin, async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { adminNotes } = req.body;
    try {
        const updatedRequest = await prisma.request.update({
            where: { id: requestId },
            data: { adminNotes },
        });
        res.json(updatedRequest);
    } catch (error) {
        res.status(500).json({ error: 'Error updating notes' });
    }
});

// Create Jira ticket
router.post('/create-jira-ticket', isAdmin, async (req, res) => {
    const { requestId, jiraProjectKey } = req.body;
    try {
        const requestDetails = await prisma.request.findUnique({
            where: { id: requestId },
            include: { 
                User: true,
                application: {
                    include: {
                        company: true
                    }
                }
            }
        });

        if (!requestDetails) return res.status(404).json({ error: 'Request not found.' });

        const jiraDescription = `
            Request Details:
            - Requestor: ${requestDetails.User ? requestDetails.User.email : 'Guest'}
            - Company: ${requestDetails.application?.company?.name || 'N/A'}
            - Application: ${requestDetails.application?.name || 'N/A'}
            - Product: ${requestDetails.products}
            - Type: ${requestDetails.requestType}
            - Users to add: ${requestDetails.users || 'N/A'}
            
            User Notes:
            ${requestDetails.notes || 'No notes provided.'}
        `;

        const jiraApiUrl = `${process.env.JIRA_URL}/rest/api/2/issue`;
        const jiraResponse = await fetch(jiraApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_KEY}`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fields: {
                    project: { key: jiraProjectKey },
                    summary: `Tool Request: ${requestDetails.products} for ${requestDetails.application?.name || 'the user'}`,
                    description: jiraDescription,
                    issuetype: { name: 'Task' },
                },
            }),
        });

        if (jiraResponse.ok) {
            const jiraData = await jiraResponse.json();
             await prisma.request.update({
                where: { id: requestId },
                data: { status: "IN_PROGRESS" }
            });
            res.json({
                ticketUrl: `${process.env.JIRA_URL}/browse/${jiraData.key}`,
                ticketKey: jiraData.key,
            });
        } else {
            const errorText = await jiraResponse.text();
            res.status(jiraResponse.status).json({ error: `Jira API Error: ${errorText}` });
        }
    } catch (error) {
        console.error('Error creating Jira ticket:', error);
        res.status(500).json({ error: 'Failed to create Jira ticket.' });
    }
});

// Run script
router.post('/run-script', isAdmin, async (req, res) => {
    const { requestId, scriptName, args } = req.body;

    const job = await prisma.scriptJob.create({
        data: {
            requestId: requestId,
            status: 'RUNNING',
            output: '--- Starting script... ---\n',
        }
    });
    res.status(202).json(job);

    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const child = spawn('python3', [scriptPath, ...args]);

    const updateOutput = async (data) => {
        await prisma.scriptJob.update({
            where: { id: job.id },
            data: { output: { increment: data } }
        });
    };

    child.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        updateOutput(data.toString());
    });

    child.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        updateOutput(`ERROR: ${data.toString()}`);
    });

    child.on('close', async (code) => {
        console.log(`child process exited with code ${code}`);
        const finalStatus = code === 0 ? 'COMPLETED' : 'FAILED';
        await prisma.scriptJob.update({
            where: { id: job.id },
            data: { status: finalStatus, endedAt: new Date() }
        });
        if (finalStatus === 'COMPLETED') {
            await prisma.request.update({
                where: { id: requestId },
                data: { status: 'COMPLETED' }
            });
        }
    });
});

// Update application via API
router.post('/applications/:id/update', async (req, res) => {
    const appId = req.params.id;
    const { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    try {
        const user = await prisma.user.findUnique({ where: { id: req.session.user.id } });
        const application = await prisma.application.findUnique({ where: { id: appId } });
        
        const isAdmin = res.locals.isAdmin;
        const isOwner = user && application && user.companyId === application.companyId;

        if (!isAdmin && !isOwner) {
            return res.status(403).json({ error: "You do not have permission to edit this application." });
        }

        const updatedApplication = await prisma.application.update({
            where: { id: appId },
            data: { name, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes },
            include: { company: true }
        });
        res.json(updatedApplication);
    } catch (error) {
        console.error(`Error updating application ${appId} by user ${req.session.user.id}:`, error);
        res.status(500).json({ error: "Error updating application" });
    }
});


module.exports = router;
