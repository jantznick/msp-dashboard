const express = require('express');
const router = express.Router();
const { prisma } = require('../prisma/client');

console.log('--- The intake.js route file was loaded ---');

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
    
    console.log('\n--- MANAGER INTAKE POST ---');
    console.log('Received body:', req.body);
    
    try {
        const user = req.session.user;
        console.log('User session:', user);
        let successMessage = "";
        let applicationFormUrl = null;

        // A user can only update directly if they are logged in, associated with a company,
        // AND the submission is for their own company.
        const canUpdateDirectly = user && user.companyId && companyId === user.companyId;
        console.log(`Checking conditions: user=${!!user}, user.companyId=${user ? user.companyId : 'N/A'}, companyId=${companyId}`);
        console.log('Result of canUpdateDirectly check:', canUpdateDirectly);

        if (canUpdateDirectly) {
            // Rule 2: Logged-in, associated user updating their OWN company.
            console.log('-> Path: Direct update');
            const { engManager: formEngManager, ...restMetadata } = metadata;
            const company = await prisma.company.update({
                where: { id: user.companyId },
                data: restMetadata
            });
            successMessage = "Your company information has been updated successfully.";
            applicationFormUrl = `${req.protocol}://${req.get('host')}/intake/application?company=${company.id}`;
        } else {
            // Rules 1 & 3: Not logged in, or logged in but not a member of the target company.
            // All these submissions are logged for admin review.
            console.log('-> Path: Log for admin review');
            const changes = Object.values(metadata).some(val => val && String(val).trim() !== '');
            console.log('Are there changes to log?', changes);

            if (!changes) {
                 successMessage = "No new information was submitted.";
            } else {
                const userEmail = user ? user.email : 'Not Logged In';

                if (companyId === 'other' && otherCompanyName) {
                    console.log('--> Sub-path: New company suggestion');
                    // Log a "new company" suggestion.
                    await prisma.changeLog.create({
                        data: {
                            userEmail,
                            proposedCompanyName: otherCompanyName.trim(),
                            changeDetails: JSON.stringify(metadata)
                        }
                    });
                } else if (companyId) {
                    console.log('--> Sub-path: Update company suggestion');
                    // Log an "update company" suggestion.
                    const targetCompany = await prisma.company.findUnique({ where: { id: companyId }});
                    if (!targetCompany) return res.status(400).send("The selected company does not exist.");
                    
                    await prisma.changeLog.create({
                        data: {
                            userEmail,
                            companyName: targetCompany.name,
                            targetCompanyId: targetCompany.id,
                            changeDetails: JSON.stringify(metadata)
                        }
                    });
                }
                successMessage = "Your suggested changes have been submitted for admin review. Thank you!";
            }
        }
        
        console.log('--- END MANAGER INTAKE ---');
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
        const companyLink = req.query.company;
        const user = req.session.user;
        const isAdmin = res.locals.isAdmin;

        if (isAdmin) {
            // Admins can always access the form and see all companies.
            const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
            let defaults = null;
            if (companyLink) {
                defaults = await prisma.company.findUnique({ where: { id: companyLink } });
            }
            return res.render('intake/application', { title: 'Application Intake', companies, defaults });
        }

        // --- Logic for non-admin users ---

        if (!user && !companyLink) {
            // Rule 1: Not logged in, no link -> redirect home
            return res.redirect('/');
        }
        
        if (user && !user.companyId && !companyLink) {
            // Rule 3: Logged in, no associated company, no link -> redirect home
            return res.redirect('/');
        }

        let companies = [];
        let defaults = null;

        if (!user && companyLink) {
            // Rule 2: Not logged in, but has a valid link
            defaults = await prisma.company.findUnique({ where: { id: companyLink } });
            if (defaults) {
                companies = [defaults]; // Only this company in the list
            } else {
                return res.redirect('/'); // Invalid link
            }
        } else {
            // Rule 4 & other cases for logged-in users
            companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
            const targetCompanyId = user ? (user.companyId || companyLink) : companyLink;
            if (targetCompanyId) {
                 defaults = await prisma.company.findUnique({ where: { id: targetCompanyId } });
            }
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
