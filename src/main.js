import axios, { AxiosResponse } from 'axios';

// Habitica API base URL
const HABITICA_API_URL = 'https://habitica.com/api/v3';

// Interface for Habitica stats
interface HabiticaStats {
  hp: number;
  exp: number;
  lvl: number;
}

// Interface for the plugin settings
interface PluginSettings {
  habiticaUserId: string;
  habiticaApiKey: string;
}

// Function to get credentials from plugin settings
export async function getHabiticaCredentials(plugin: any): Promise<PluginSettings> {
  const userId = await plugin.settings.getSetting('habiticaUserId') as string;
  const apiKey = await plugin.settings.getSetting('habiticaApiKey') as string;
  
  if (!userId || !apiKey) {
    throw new Error('Habitica credentials not set');
  }
  
  return {
    habiticaUserId: userId,
    habiticaApiKey: apiKey
  };
}

// Function to get user stats from Habitica
export async function getHabiticaStats(credentials: PluginSettings): Promise<HabiticaStats> {
  try {
    const response: AxiosResponse = await axios.get(`${HABITICA_API_URL}/user`, {
      headers: {
        'x-api-user': credentials.habiticaUserId,
        'x-api-key': credentials.habiticaApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    // Extract relevant stats
    const { hp, exp, lvl } = response.data.data.stats;
    
    return {
      hp,
      exp,
      lvl
    };
  } catch (error) {
    console.error('Error fetching Habitica stats:', error);
    throw error;
  }
}

// Function to award XP in Habitica
export async function awardHabiticaXP(xpAmount: number, activityType: string, credentials: PluginSettings): Promise<void> {
  try {
    const response: AxiosResponse = await axios.post(
      `${HABITICA_API_URL}/user/score/up`,
      {
        type: 'reward',
        scoreNotes: `RemNote ${activityType}: ${xpAmount} XP`,
        amount: xpAmount
      },
      {
        headers: {
          'x-api-user': credentials.habiticaUserId,
          'x-api-key': credentials.habiticaApiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.success) {
      console.log(`Successfully awarded ${xpAmount} XP in Habitica for ${activityType}`);
    } else {
      console.error(`Failed to award XP in Habitica for ${activityType}`, response.data);
    }
  } catch (error) {
    console.error(`Error awarding XP in Habitica for ${activityType}:`, error);
  }
}

// Function to reduce HP in Habitica
export async function reduceHabiticaHP(hpAmount: number, activityType: string, credentials: PluginSettings): Promise<void> {
  try {
    const response: AxiosResponse = await axios.post(
      `${HABITICA_API_URL}/user/score/down`,
      {
        type: 'reward',
        scoreNotes: `RemNote ${activityType}: ${hpAmount} HP reduction`,
        amount: hpAmount
      },
      {
        headers: {
          'x-api-user': credentials.habiticaUserId,
          'x-api-key': credentials.habiticaApiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data.success) {
      console.log(`Successfully reduced ${hpAmount} HP in Habitica for ${activityType}`);
    } else {
      console.error(`Failed to reduce HP in Habitica for ${activityType}`, response.data);
    }
  } catch (error) {
    console.error(`Error reducing HP in Habitica for ${activityType}:`, error);
  }
}

// Function to update Habitica stats based on flashcard performance
export async function updateHabiticaBasedOnFlashcard(
  performance: string, 
  settings: any, 
  credentials: PluginSettings, 
  sessionStats: any
): Promise<void> {
  try {
    switch(performance) {
      case 'easy':
        const xpEasy = settings.xpEasy as number;
        await awardHabiticaXP(xpEasy, `Flashcard Review (easy)`, credentials);
        sessionStats.reviewedEasy++;
        break;
      case 'good':
        const xpGood = settings.xpGood as number;
        await awardHabiticaXP(xpGood, `Flashcard Review (good)`, credentials);
        sessionStats.reviewedGood++;
        break;
      case 'hard':
        const xpHard = settings.xpHard as number;
        await awardHabiticaXP(xpHard, `Flashcard Review (hard)`, credentials);
        sessionStats.reviewedHard++;
        break;
      case 'fail':
        const hpFail = settings.hpFail as number;
        await reduceHabiticaHP(hpFail, `Flashcard Review (fail)`, credentials);
        sessionStats.reviewedFail++;
        break;
    }
  } catch (error) {
    console.error('Error updating Habitica based on flashcard performance:', error);
  }
}

// Function to award XP for flashcard creation
export async function awardXPForFlashcardCreation(
  settings: any, 
  credentials: PluginSettings, 
  sessionStats: any
): Promise<void> {
  try {
    const xpPerCreatedCard = settings.xpPerCreatedCard as number;
    await awardHabiticaXP(xpPerCreatedCard, 'Flashcard Creation', credentials);
    sessionStats.cardsCreated++;
  } catch (error) {
    console.error('Error awarding XP for flashcard creation:', error);
  }
}

// Main function to activate the plugin
export async function onActivate(plugin: any): Promise<void> {
  try {
    // Get credentials from plugin settings
    const credentials = await getHabiticaCredentials(plugin);
    
    // Get settings for XP and HP values
    const settings = {
      xpEasy: await plugin.settings.getSetting('xpEasy'),
      xpGood: await plugin.settings.getSetting('xpGood'),
      xpHard: await plugin.settings.getSetting('xpHard'),
      hpFail: await plugin.settings.getSetting('hpFail'),
      xpPerCreatedCard: await plugin.settings.getSetting('xpPerCreatedCard')
    };
    
    // Stats for the current session
    let sessionStats = {
      cardsCreated: 0,
      reviewedEasy: 0,
      reviewedGood: 0,
      reviewedHard: 0,
      reviewedFail: 0
    };
    
    // Listen for flashcard complete events
    plugin.event.addListener('AFTER_FLASHCARD_RESPONDED', async (response: any) => {
      const performance = response.feedback;
      await updateHabiticaBasedOnFlashcard(performance, settings, credentials, sessionStats);
    });
    
    // Listen for flashcard creation events
    plugin.event.addListener('FLASHCARD_CREATED', async () => {
      await awardXPForFlashcardCreation(settings, credentials, sessionStats);
    });
    
    // Get initial stats from Habitica
    const initialStats = await getHabiticaStats(credentials);
    console.log('Current Habitica stats:', initialStats);
    
  } catch (error) {
    console.error('Error activating plugin:', error);
  }
}

// Function to synchronize all accumulated stats with Habitica
export async function synchronizeWithHabitica(
  sessionStats: any, 
  settings: any, 
  credentials: PluginSettings
): Promise<void> {
  try {
    // Calculate total XP
    const totalXP = 
      (sessionStats.reviewedEasy * settings.xpEasy) + 
      (sessionStats.reviewedGood * settings.xpGood) + 
      (sessionStats.reviewedHard * settings.xpHard) + 
      (sessionStats.cardsCreated * settings.xpPerCreatedCard);
    
    // Award total XP if positive
    if (totalXP > 0) {
      await awardHabiticaXP(totalXP, 'RemNote Flashcard Activity (Manual Sync)', credentials);
    }
    
    // Reset session stats
    return {
      cardsCreated: 0,
      reviewedEasy: 0,
      reviewedGood: 0,
      reviewedHard: 0,
      reviewedFail: 0
    };
  } catch (error) {
    console.error('Error synchronizing with Habitica:', error);
    throw error;
  }
}

export default {
  onActivate,
  getHabiticaCredentials,
  getHabiticaStats,
  awardHabiticaXP,
  reduceHabiticaHP,
  updateHabiticaBasedOnFlashcard,
  awardXPForFlashcardCreation,
  synchronizeWithHabitica
};