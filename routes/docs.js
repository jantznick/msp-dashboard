const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { marked } = require('marked');
const { prisma } = require('../prisma/client');

const docsDir = path.join(__dirname, '..', 'docs');
const productsDir = path.join(__dirname, '..', 'content', 'products');

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

const getTitle = (content) => {
    const match = content.match(/^#\s+(.*)/);
    return match ? match[1] : 'Documentation';
};

// This is the single router for all docs and product pages
router.get('/*', async (req, res) => {
    try {
        const slug = req.params[0] || 'program-overview';
        let isProductPage = slug.startsWith('products/');
        let content, title, currentSlugForNav;

        // --- Determine content source and title ---
        if (isProductPage) {
            const productSlug = slug.replace('products/', '');
            const filePath = path.join(productsDir, `${productSlug}.md`);
            if (!fs.existsSync(filePath)) throw new Error('Product not found');

            const markdown = fs.readFileSync(filePath, 'utf-8');
            const { attributes, body } = parseFrontMatter(markdown);
            const htmlContent = marked(body);
            title = attributes.title || 'Product Detail';
            currentSlugForNav = slug;

            let applications = [];
            if (req.session.user && req.session.user.companyId) {
                applications = await prisma.application.findMany({
                    where: { companyId: req.session.user.companyId }
                });
            }

            content = await ejs.renderFile(
                path.join(__dirname, '..', 'views', 'product-detail.ejs'), {
                    productName: attributes.title,
                    product: { ...attributes, content: htmlContent, slug: productSlug },
                    applications,
                    submitted: req.query.submitted === 'true'
                }
            );
        } else {
            const filePath = path.join(docsDir, `${slug}.md`);
            if (!fs.existsSync(filePath)) throw new Error('Doc not found');

            let markdownContent = fs.readFileSync(filePath, 'utf8');
            title = getTitle(markdownContent);
            currentSlugForNav = slug;
            markdownContent = markdownContent.replace(/^#\s+.*/, '');
            content = marked(markdownContent);
        }

        // --- Build Navigation ---
        const productPages = fs.readdirSync(productsDir).map(file => {
            const pContent = fs.readFileSync(path.join(productsDir, file), 'utf-8');
            const { attributes } = parseFrontMatter(pContent);
            return {
                title: attributes.title || 'Untitled',
                slug: `products/${file.replace('.md', '')}`
            };
        });

        const navStructure = [
            { group: 'Overview', pages: ['program-overview', 'new-app-sec-customer-roadmap', 'app-sec-defined-terms'] },
            { group: 'Services', pages: ['penetration-testing', 'threat-modeling-for-developers', 'domain-monitoring', 'samm-assessments', 'app-sec-capabilities'] },
            { group: 'Onboarding', pages: ['posture-analysis-questionnaire', 'application-onboarding-questionnaire'] },
            { group: 'Developer Resources', pages: ['developer-checklist'] },
            { group: 'Technology Stack', isProduct: true, pages: productPages }
        ];

        const navLinks = navStructure.map(group => {
            if (group.isProduct) return group;
            return {
                group: group.group,
                pages: group.pages.map(pSlug => ({
                    title: getTitle(fs.readFileSync(path.join(docsDir, `${pSlug}.md`), 'utf8')),
                    slug: pSlug
                }))
            };
        });
        
        const flatPageList = navStructure.flatMap(g => g.pages.map(p => typeof p === 'string' ? p : p.slug));
        const currentIndex = flatPageList.indexOf(currentSlugForNav);
        const prevPage = currentIndex > 0 ? flatPageList[currentIndex - 1] : null;
        const nextPage = currentIndex < flatPageList.length - 1 ? flatPageList[currentIndex + 1] : null;

        // --- Render final page ---
        res.render('docs/layout', {
            title, content, navLinks,
            currentSlug: currentSlugForNav,
            prevPage, nextPage
        });

    } catch (error) {
        console.error("Error loading page:", error);
        res.status(404).render('error', { title: 'Not Found', message: 'Page not found.' });
    }
});

module.exports = router;
