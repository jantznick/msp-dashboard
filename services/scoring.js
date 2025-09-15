const fs = require('fs');
const path = require('path');

// Load configs once
const integrationLevels = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'scoring', 'integrationLevels.json'), 'utf-8'));
const toolQuality = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'scoring', 'toolQuality.json'), 'utf-8'));
const riskFactors = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'scoring', 'riskFactors.json'), 'utf-8'));

const MAX_SCORE_PER_CATEGORY = 50;

const calculateKnowledgeSharingScore = (app) => {
    let score = 0;
    const totalFields = 8; // Number of metadata fields we are scoring on
    let fieldsFilled = 0;

    if (app.description) fieldsFilled++;
    if (app.owner) fieldsFilled++;
    if (app.repoUrl) fieldsFilled++;
    if (app.language) fieldsFilled++;
    if (app.framework) fieldsFilled++;
    if (app.serverEnvironment) fieldsFilled++;
    if (app.authProfiles) fieldsFilled++;
    if (app.dataTypes) fieldsFilled++;
    
    score = (fieldsFilled / totalFields) * (MAX_SCORE_PER_CATEGORY * 0.8); // Completeness is 80% of the score

    if (app.metadataLastReviewed) {
        const reviewDate = new Date(app.metadataLastReviewed);
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        if (reviewDate > sixMonthsAgo) {
            score += MAX_SCORE_PER_CATEGORY * 0.2; // Freshness is 20% of the score
        }
    }
    
    return Math.round(score);
};

const calculateToolUsageScore = (app) => {
    const toolCategories = ['sast', 'dast', 'appFirewall', 'apiSecurity'];
    const MAX_TOOL_SCORE = 50;
    const BASE_POINTS_PER_CATEGORY = MAX_TOOL_SCORE / toolCategories.length; // 12.5

    let totalAchievedPoints = 0;
    let totalPossiblePoints = 0;

    for (const category of toolCategories) {
        // 1. Determine the risk-adjusted maximum points for this category
        let riskWeight = 1.0;
        if (app.facing && riskFactors.facing[app.facing]) {
            riskWeight = Math.max(riskWeight, riskFactors.facing[app.facing]);
        }
        (app.dataTypes || '').split(',').forEach(dt => {
            const trimmedDt = dt.trim();
            if (riskFactors.dataTypes[trimmedDt]) {
                riskWeight = Math.max(riskWeight, riskFactors.dataTypes[trimmedDt]);
            }
        });
        const categoryMaxPoints = BASE_POINTS_PER_CATEGORY * riskWeight;

        // 2. Add to total possible points for normalization
        totalPossiblePoints += categoryMaxPoints;
        
        const isNA = app[`${category}NA`];
        if (isNA) {
            // If Not Applicable, the app achieves the full possible points for this category
            totalAchievedPoints += categoryMaxPoints;
            continue;
        }

        // 3. Calculate achieved points based on implementation
        const tool = app[`${category}Tool`];
        const level = app[`${category}IntegrationLevel`];
        if (!tool || !level) {
            continue; // No tool, so 0 achieved points for this category
        }

        const integrationWeight = integrationLevels[level]?.weight || 0;
        
        let toolWeight = toolQuality.other || 0.8;
        if (toolQuality.managed[tool]) {
            toolWeight = toolQuality.managed[tool];
        } else if (toolQuality.approvedUnmanaged[tool]) {
            toolWeight = toolQuality.approvedUnmanaged[tool];
        }

        const achievedPointsForTool = categoryMaxPoints * integrationWeight * toolWeight;
        totalAchievedPoints += achievedPointsForTool;
    }
    
    if (totalPossiblePoints === 0) return 0;

    // 4. Normalize the score to be out of 50
    const normalizedScore = (totalAchievedPoints / totalPossiblePoints) * MAX_TOOL_SCORE;

    return Math.round(normalizedScore);
};

const calculateApplicationScore = (app) => {
    const knowledgeScore = calculateKnowledgeSharingScore(app);
    const toolScore = calculateToolUsageScore(app);
    const totalScore = knowledgeScore + toolScore;

    return {
        knowledgeScore,
        toolScore,
        totalScore: totalScore // This will now naturally be <= 100
    };
};

module.exports = { calculateApplicationScore };
