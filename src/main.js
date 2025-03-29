// Import required libraries
const axios = require('axios');

// Habitica API configuration
const HABITICA_USER_ID = 'your-habitica-user-id';
const HABITICA_API_TOKEN = 'your-habitica-api-token';
const HABITICA_API_URL = 'https://habitica.com/api/v3';

// RemNote plugin configuration
async function onActivate(plugin) {
    // Register a hook to track flashcard completions
    await plugin.app.registerHook('flashcard:complete', async (flashcard) => {
        // Award XP in Habitica based on recall performance
        switch(flashcard.performance) {
            case 'easy':
                await awardHabiticaXP(2); // Easily recalled
                break;
            case 'good':
                await awardHabiticaXP(1); // Recalled with effort
                break;
            case 'hard':
                await awardHabiticaXP(0.5); // Partially recalled
                break;
            case 'fail':
                await reduceHabiticaHP(0.1); // Forgotten
                break;
        }
    });

    // Register a hook to track flashcard creation
    await plugin.app.registerHook('flashcard:create', async (flashcard) => {
        // Award XP in Habitica for each created flashcard
        await awardHabiticaXP(5); // Award 5 XP per flashcard created
    });
}

// Function to award XP in Habitica
async function awardHabiticaXP(xpAmount) {
    try {
        const response = await axios.post(
            `${HABITICA_API_URL}/user/score/up`,
            {
                type: 'reward',
                value: xpAmount
            },
            {
                headers: {
                    'x-api-user': HABITICA_USER_ID,
                    'x-api-key': HABITICA_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Successfully awarded ${xpAmount} XP in Habitica`);
    } catch (error) {
        console.error('Error awarding XP in Habitica:', error);
    }
}

// Function to reduce HP in Habitica
async function reduceHabiticaHP(hpAmount) {
    try {
        const response = await axios.post(
            `${HABITICA_API_URL}/user/score/down`,
            {
                type: 'reward',
                value: hpAmount
            },
            {
                headers: {
                    'x-api-user': HABITICA_USER_ID,
                    'x-api-key': HABITICA_API_TOKEN,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Successfully reduced ${hpAmount} HP in Habitica`);
    } catch (error) {
        console.error('Error reducing HP in Habitica:', error);
    }
}

module.exports = {
    onActivate,
};
