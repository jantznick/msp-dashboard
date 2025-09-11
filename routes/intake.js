const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma/client');

router.get('/manager', async (req, res) => {
    try {
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('intake/manager', { title: 'Manager Intake', companies });
    } catch (error) {
        console.error('Error loading manager intake form:', error);
        res.status(500).send("Error loading form.");
    }
});

router.post('/manager', async (req, res) => {
    const { companyId, otherCompanyName, engManager, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    const metadata = { engManager, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes };
    
    try {
        let company;
        let successMessage = "Your submission was successful.";
        let applicationFormUrl = null;

        if (req.session.user && req.session.user.companyId) {
            // Associated users can update their own company directly.
            const { engManager: formEngManager, ...restMetadata } = metadata;
            company = await prisma.company.update({
                where: { id: req.session.user.companyId },
                data: restMetadata
            });
            successMessage = "Your company information has been updated successfully.";
            applicationFormUrl = `${req.protocol}://${req.get('host')}/intake/application?company=${company.id}`;
        
        } else {
            // Unassociated users' submissions are logged for review.
            const changes = Object.values(metadata).some(val => val);

            if (!changes) {
                 successMessage = "No new information was submitted.";
            } else {
                if (companyId === 'other' && otherCompanyName) {
                    // Log a "new company" suggestion.
                    await prisma.changeLog.create({
                        data: {
                            userEmail: req.session.user ? req.session.user.email : 'Not Logged In',
                            proposedCompanyName: otherCompanyName.trim(),
                            changeDetails: JSON.stringify(metadata)
                        }
                    });
                } else {
                    // Log an "update company" suggestion.
                    const targetCompany = await prisma.company.findUnique({ where: { id: companyId }});
                    if (!targetCompany) return res.status(400).send("The selected company does not exist.");
                    
                    await prisma.changeLog.create({
                        data: {
                            userEmail: req.session.user ? req.session.user.email : 'Not Logged In',
                            companyName: targetCompany.name,
                            targetCompanyId: targetCompany.id,
                            changeDetails: JSON.stringify(metadata)
                        }
                    });
                }
                successMessage = "Your suggested changes have been submitted for admin review. Thank you!";
            }
        }
        
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('intake/manager', {
            title: 'Manager Intake',
            user: req.session.user,
            companies,
            successMessage,
            applicationFormUrl
        });
    } catch (error) {
        console.error('Error processing manager intake:', error);
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.status(500).render('intake/manager', {
            title: 'Manager Intake',
            user: req.session.user,
            companies,
            errorMessage: "Error processing intake form."
        });
    }
});

router.get('/application', async (req, res) => {
    try {
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        let defaults = null;
        
        if (req.session.user && req.session.user.companyId) {
            defaults = await prisma.company.findUnique({ where: { id: req.session.user.companyId } });
        } else if (req.query.company) {
            defaults = await prisma.company.findUnique({ where: { id: req.query.company } });
        }

        res.render('intake/application', { title: 'Application Intake', companies, defaults });
    } catch (error) {
        console.error('Error loading application intake form:', error);
        res.status(500).send("Error loading form.");
    }
});

router.post('/application', async (req, res) => {
    const { name, companyId, otherCompanyName, description, owner, repoUrl, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    
    try {
        let finalCompanyId = companyId;

        if (companyId === 'other' && otherCompanyName) {
            const newCompany = await prisma.company.upsert({
                where: { name: otherCompanyName.trim() },
                update: {},
                create: { name: otherCompanyName.trim() }
            });
            finalCompanyId = newCompany.id;
        }

        if (!finalCompanyId) {
            throw new Error("Company ID is missing.");
        }

        await prisma.application.create({
            data: {
                name, 
                companyId: finalCompanyId, 
                description, owner, repoUrl, language, framework,
                serverEnvironment, facing, deploymentType, authProfiles, dataTypes
            }
        });
        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('intake/application', { 
            title: 'Application Intake',
            companies,
            defaults: null,
            successMessage: "Application submitted successfully. Thank you!" 
        });
    } catch (error) {
        console.error('Error processing application intake:', error);
        res.status(500).send("Error processing intake form.");
    }
});

module.exports = router;
