const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { prisma } = require('../prisma/client');

// Login
router.get('/login', (req, res) => {
    res.render('login', { title: 'Login', error: null });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.user.findUnique({ 
            where: { email },
            include: { company: true }
        });
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = user;
            res.redirect('/');
        } else {
            res.render('login', { title: 'Login', error: 'Invalid email or password' });
        }
    } catch (error) {
        res.render('login', { title: 'Login', error: 'An error occurred.' });
    }
});

// Register
router.get('/register', (req, res) => {
    res.render('register', { title: 'Register', error: null });
});

router.post('/register', async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
        return res.render('register', { title: 'Register', error: 'Passwords do not match' });
    }
    try {
        const hashedPassword = bcrypt.hashSync(password, 10);
        
        let companyId = null;
        const userDomain = email.split('@')[1];
        if (userDomain) {
            const companies = await prisma.company.findMany();
            const matchingCompany = companies.find(c => c.domains && c.domains.split(',').map(d => d.trim()).includes(userDomain));
            if (matchingCompany) {
                companyId = matchingCompany.id;
            }
        }
        
        const user = await prisma.user.create({
            data: { email, password: hashedPassword, companyId },
            include: { company: true }
        });
        req.session.user = user;
        res.redirect('/');
    } catch (error) {
        if (error.code === 'P2002') { // Unique constraint failed
            res.render('register', { title: 'Register', error: 'Email already exists' });
        } else {
            res.render('register', { title: 'Register', error: 'An error occurred' });
        }
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.redirect('/');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

module.exports = router;
