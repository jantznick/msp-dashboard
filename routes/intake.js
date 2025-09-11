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
    const { companyId, otherCompanyName, companyName, engManager, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes } = req.body;
    const metadata = { engManager, language, framework, serverEnvironment, facing, deploymentType, authProfiles, dataTypes };

    try {
        let company;
        if (req.session.user && req.session.user.companyId) {
            const { engManager: formEngManager, ...restMetadata } = metadata;
            company = await prisma.company.update({
                where: { id: req.session.user.companyId },
                data: restMetadata
            });
        } else {
            let oldCompanyData = null;
            if (companyId && companyId !== 'other') {
                oldCompanyData = await prisma.company.findUnique({ where: { id: companyId } });
            } else if (otherCompanyName) {
                oldCompanyData = await prisma.company.findUnique({ where: { name: otherCompanyName.trim() } });
            }

            if (companyId === 'other' && otherCompanyName) {
                company = await prisma.company.upsert({
                    where: { name: otherCompanyName.trim() },
                    update: metadata,
                    create: { name: otherCompanyName.trim(), ...metadata }
                });
            } else if (companyId) {
                company = await prisma.company.update({
                    where: { id: companyId },
                    data: metadata
                });
            } else {
                return res.status(400).send("A company must be selected or created.");
            }

            if (req.session.user) {
                const changes = Object.keys(metadata).map(key => {
                    const oldValue = oldCompanyData ? (oldCompanyData[key] || "Not set") : "Not set";
                    const newValue = metadata[key] || "Not set";
                    return { key, oldValue, newValue };
                }).filter(c => c.oldValue !== c.newValue && c.newValue !== "Not set");

                if (changes.length > 0) {
                    await prisma.changeLog.create({
                        data: {
                            userEmail: req.session.user.email,
                            companyName: company.name,
                            changeDetails: JSON.stringify(changes)
                        }
                    });
                }
            }
            
            if (req.session.user && !req.session.user.companyId) {
                const updatedUser = await prisma.user.update({
                    where: { id: req.session.user.id },
                    data: { companyId: company.id },
                    include: { company: true }
                });
                req.session.user = updatedUser;
            }
        }
        
        const fullUrl = `${req.protocol}://${req.get('host')}/intake/application?company=${company.id}`;

        const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } });
        res.render('intake/manager', {
            title: 'Manager Intake',
            user: req.session.user,
            companies,
            successMessage: "Company information has been saved successfully.",
            applicationFormUrl: fullUrl
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
