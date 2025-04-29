import { declareIndexPlugin, ReactRNPlugin, WidgetLocation, AppEvents, QueueInteractionScore, SettingSchemaDesc, QueueItemType, Rem, RemId, StorageEvents, useTracker, Card, CardNamespace, useRunAsync} from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';
import axios from 'axios';

// Habitica API base URL
const HABITICA_API_URL = 'https://habitica.com/api/v3';

// Define the plugin
async function onActivate(plugin: ReactRNPlugin) {
  // Configuration for API access
  await plugin.settings.registerStringSetting({
    id: 'habiticaUserId',
    title: 'Habitica User ID',
    description: 'Your Habitica User ID',
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: 'habiticaApiKey',
    title: 'Habitica API Key',
    description: 'Your Habitica API Key',
    defaultValue: '',
  });

  // Performance-based XP settings
  await plugin.settings.registerNumberSetting({
    id: 'xpEasy',
    title: 'XP for "Easy" Response',
    description: 'How much XP to award for "Easy" flashcard responses',
    defaultValue: 2,
  });

  await plugin.settings.registerNumberSetting({
    id: 'xpGood',
    title: 'XP for "Good" Response',
    description: 'How much XP to award for "Good" flashcard responses',
    defaultValue: 1,
  });

  await plugin.settings.registerNumberSetting({
    id: 'xpHard',
    title: 'XP for "Hard" Response',
    description: 'How much XP to award for "Hard" flashcard responses',
    defaultValue: 0.5,
  });

  await plugin.settings.registerNumberSetting({
    id: 'hpFail',
    title: 'HP Reduction for "Fail" Response',
    description: 'How much HP to reduce for "Fail" flashcard responses',
    defaultValue: -0.1,
  });

  await plugin.settings.registerNumberSetting({
    id: 'xpPerCreatedCard',
    title: 'XP Per Created Flashcard',
    description: 'How much XP to award per flashcard created',
    defaultValue: 5,
  });


  // Session tracking variables
  let completedCardsCount = 0;
  let createdCardsCount = 0;
  let createdRemsCount = 0;
  let queuedCardsCount = 0;
  let pendingXP = 0;
  let pendingHPReduction = 0;
  let lastSyncTime = Date.now();
  let idleElapsedTime = new Date();
  
  // Current Habitica stats
  let currentHabiticaXP = 0;
  let currentHabiticaHP = 0;
  let maxHabiticaHP = 50; // Default value, will be updated

  // Register a setting for sync frequency
  await plugin.settings.registerNumberSetting({
    id: 'syncFrequency',
    title: 'Sync Frequency (minutes)',
    description: 'How often to sync XP with Habitica (0 for immediate sync)',
    defaultValue: 5,
  });

  // Check if plugin is working
  await plugin.app.toast("Habitica XP Plugin activated!");
  
  // Function to get updated Habitica config
  async function getHabiticaConfig() {
    const userId = await plugin.settings.getSetting<string>('habiticaUserId');
    const apiKey = await plugin.settings.getSetting<string>('habiticaApiKey');
    
    return {
      headers: {
        'x-api-user': userId,
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    };
  }
  
  // Function to get current Habitica user data and update local variables
  async function getHabiticaUserData(): Promise<any> {
    try {
      const config = await getHabiticaConfig();
      const response = await axios.get(`${HABITICA_API_URL}/user`, {
        headers: config.headers
      });
      
      if (response.data.success) {
        console.log('Successfully retrieved Habitica user data');
        
        // Update our local stats variables
        currentHabiticaXP = response.data.data.stats.exp;
        currentHabiticaHP = response.data.data.stats.hp;
        maxHabiticaHP = response.data.data.stats.maxHealth;
        
        console.log(`Current Habitica stats: XP=${currentHabiticaXP}, HP=${currentHabiticaHP}/${maxHabiticaHP}`);
        
        return response.data.data;
      } else {
        console.error('Failed to get Habitica user data:', response.data.message);
        return null;
      }
    } catch (error) {
      console.error('Error getting Habitica user data:', error);
      return null;
    }
  }
  
  // Function to calculate XP for a single card review
  async function calculateSingleCardXP(score: number) {
    const xpEasy = await plugin.settings.getSetting<number>('xpEasy');
    const xpGood = await plugin.settings.getSetting<number>('xpGood');
    const xpHard = await plugin.settings.getSetting<number>('xpHard');
    
    let xp = 0;
    
    switch (score) {
      case 1.5: // Easy
        xp = xpEasy;
        break;
      case 1: // Good
        xp = xpGood;
        break;
      case 0.5: // Hard
        xp = xpHard;
        break;
      case 0: // Fail
        xp = 0; // No XP for fails, handled by HP reduction
        break;
      default:
        xp = 0;
    }
    
    return xp;
  }
  
  // Function to calculate HP reduction for a single card fail
  async function calculateSingleCardHPReduction(score: number) {
    const hpFail = await plugin.settings.getSetting<number>('hpFail');
    
    let dhp = 0;
    
    switch (score) {
      case 0: // Fail
        dhp = hpFail; // HP reduction for fails
        break;
      default:
        dhp = 0;
    }
    
    return dhp;
  }
  
  // When a flashcard is reviewed
  plugin.event.addListener(AppEvents.QueueCompleteCard, undefined, async (data) => {
    idleElapsedTime = new Date();
    const card: Card | undefined = await plugin.card.findOne(data.cardId);
    
    if (card == null || card == undefined) return;
    
    // Get the score from the most recent repetition
    if (card.repetitionHistory && card.repetitionHistory.length > 0) {
      const latestRepetition = card.repetitionHistory[card.repetitionHistory.length - 1];
      const score = latestRepetition.score;
      
      // Calculate XP based on score
      const earnedXP = await calculateSingleCardXP(score);
      
      // Calculate HP reduction if applicable
      const hpReduction = await calculateSingleCardHPReduction(score);
      
      completedCardsCount++;
      
      // Add earned XP to pending total
      if (earnedXP > 0) {
        pendingXP += earnedXP;
        console.log(`Card reviewed with score ${score}. Added ${earnedXP} XP.`);
        await plugin.app.toast(`Card reviewed with score ${score}. Added ${earnedXP} XP.`);
      }
      
      // Apply HP reduction if applicable
      if (hpReduction < 0) {
        pendingHPReduction += hpReduction;
        console.log(`Card review failed. HP will be reduced by ${Math.abs(hpReduction)}.`);
        await plugin.app.toast(`Card review failed. HP will be reduced by ${Math.abs(hpReduction)}.`);
      }
      
      // Check if we should sync now
      if (await shouldSyncNow()) {
        await syncWithHabitica();
      } else {
        const syncFrequency = await plugin.settings.getSetting<number>('syncFrequency');
        await plugin.app.toast(`Current pending sync: ${pendingXP} XP, ${pendingHPReduction} HP. Will sync in ${syncFrequency} minutes.`);
      }
    }
  });


// Track creation of descriptor and concept Rems
plugin.event.addListener(AppEvents.GlobalRemChanged, undefined, async (blah) => {
    
    // Check if the Rem was created recently (less than 1 second ago)
    if (blah.createdAt = Date.now()) {
      const rem: Rem | undefined = await plugin.rem.findOne(blah.remId);
      
      if (rem == null || rem == undefined) return;
      
      // Get powerup types to check if it's a descriptor or concept
      const powerupTypes = await rem.type;
      
      // Check if the Rem is a descriptor or concept
      if (powerupTypes === 1 || powerupTypes === 2) {
        const remxp = await plugin.settings.getSetting<number>('xpPerCreatedCard')/10;
        pendingXP += remxp;
        createdRemsCount++;
        
        // Log and toast notification
        console.log(`Created ${rem.type} Rem. Added ${await plugin.settings.getSetting<number>('xpPerCreatedCard')} XP.`);
        await plugin.app.toast(`Created ${rem.type} Rem. Added ${await plugin.settings.getSetting<number>('xpPerCreatedCard')} XP.`);
        
      // Check if we should sync now
      if (await shouldSyncNow()) {
        await syncWithHabitica();
      } else {
        const syncFrequency = await plugin.settings.getSetting<number>('syncFrequency');
        await plugin.app.toast(`Current pending sync: ${pendingXP} XP, ${pendingHPReduction} HP. Will sync in ${syncFrequency} minutes.`);
      }
      }
 
}});


    
  
  // Function to update Habitica stats with current values plus pending changes
  const updateHabiticaStats = async (): Promise<boolean> => {
    if (pendingXP === 0 && pendingHPReduction === 0) {
      console.log("No pending changes to sync");
      return true;
    }
    
    try {
      // First, get the latest stats from Habitica
      await getHabiticaUserData();
      
      // Calculate new values
      const newXP = currentHabiticaXP + pendingXP;
      let newHP = currentHabiticaHP + pendingHPReduction;
      
      // Ensure HP doesn't go below 0 or above max
      newHP = Math.max(0, Math.min(newHP, maxHabiticaHP));
      
      console.log(`Updating Habitica stats: XP from ${currentHabiticaXP} to ${newXP}, HP from ${currentHabiticaHP} to ${newHP}`);
      
      const config = await getHabiticaConfig();
      const response = await axios.put(
        `${HABITICA_API_URL}/user`,
        { 
          "stats.hp": newHP,
          "stats.exp": newXP
        },
        { headers: config.headers }
      );
      
      if (response.data.success) {
        if (pendingXP > 0) {
          console.log(`Successfully updated XP to ${newXP} in Habitica!`);
          await plugin.app.toast(`Added ${pendingXP} XP to Habitica!`);
        }
        
        if (pendingHPReduction < 0) {
          console.log(`Successfully updated HP to ${newHP} in Habitica!`);
          await plugin.app.toast(`HP is now ${Math.floor(newHP)}/${maxHabiticaHP} in Habitica!`);
        }
        
        // Update our local values
        currentHabiticaXP = newXP;
        currentHabiticaHP = newHP;
        
        return true;
      } else {
        console.error('Failed to update Habitica stats:', response.data.message);
        await plugin.app.toast('Failed to update Habitica stats', {
          type: 'error',
        });
        return false;
      }
    } catch (error) {
      console.error('Error updating Habitica stats:', error);
      await plugin.app.toast('Error updating Habitica stats', {
        type: 'error',
      });
      return false;
    }
  };

  // Function to check if it's time to sync with Habitica
  async function shouldSyncNow(): Promise<boolean> {
    const syncFrequency = await plugin.settings.getSetting<number>('syncFrequency');
    
    // If sync frequency is 0, sync immediately
    if (syncFrequency === 0) {
      return true;
    }
    
    // Check if it's been enough time since last sync
    const now = Date.now();
    const minutesSinceLastSync = (now - lastSyncTime) / (1000 * 60);
    
    return minutesSinceLastSync >= syncFrequency;
  }

  // Function to sync accumulated changes with Habitica
  async function syncWithHabitica(): Promise<void> {
    try {
      if (pendingXP > 0 || pendingHPReduction < 0) {
        const updateResult = await updateHabiticaStats();
        
        if (updateResult) {
          // Reset pending values after successful update
          pendingXP = 0;
          pendingHPReduction = 0;
          
          // Update last sync time
          lastSyncTime = Date.now();
          
          console.log("Sync complete!");
        }
      } else {
        console.log("No pending changes to sync");
      }
    } catch (error) {
      console.error("Error during sync:", error);
      await plugin.app.toast("Error syncing with Habitica", {
        type: 'error',
      });
    }
  }

  // Helper function to get flashcard repetition stats
  async function getNumberRepetitionsGroupedByScore(cards: Card[]): Promise<Record<string, number>> {
    // Initialize results object with default values
    const results = {
      "Easily Recalled": 0,
      "Recalled with Effort": 0,
      "Partially Recalled": 0,
      "Forgot": 0,
      "Skip": 0
    };
    
    // Process each card
    for (const card of cards) {
      if (card.repetitionHistory && card.repetitionHistory.length > 0) {
        // Get most recent repetition
        const latestRep = card.repetitionHistory[card.repetitionHistory.length - 1];
        
        // Count by score
        switch (latestRep.score) {
          case 1.5:
            results["Easily Recalled"]++;
            break;
          case 1:
            results["Recalled with Effort"]++;
            break;
          case 0.5:
            results["Partially Recalled"]++;
            break;
          case 0:
            results["Forgot"]++;
            break;
          default:
            results["Skip"]++;
        }
      }
    }
    
    return results;
  }

  // Initialize the plugin by getting current Habitica stats
  await getHabiticaUserData();

  // Add a command to force sync with Habitica
  await plugin.app.registerCommand({
    id: 'sync-habitica',
    name: 'Sync with Habitica',
    action: async () => {
      await syncWithHabitica();
      
      // Then get and display user data
      const userData = await getHabiticaUserData();
      if (userData) {
        await plugin.app.toast(`Connected to Habitica as ${userData.profile.name}`, {
          type: 'success',
        });
        // Display current stats
        const stats = userData.stats;
        console.log("Habitica stats:", stats);
        await plugin.app.toast(`Level: ${stats.lvl}, XP: ${Math.floor(stats.exp)}/${Math.floor(stats.toNextLevel)}, HP: ${Math.floor(stats.hp)}/${stats.maxHealth}`, {
          type: 'info',
        });
        
        // Display session summary
        await plugin.app.toast(`Session summary: ${completedCardsCount} cards completed, ${createdCardsCount} cards created, ${createdRemsCount} Rems created, ${queuedCardsCount} cards queued`, {
          type: 'info',
        });
      } else {
        await plugin.app.toast('Failed to connect to Habitica. Check your credentials.', {
          type: 'error',
        });
      }
    },
  });

  // Add a command to show stats
  await plugin.app.registerCommand({
    id: 'show-session-stats',
    name: 'Show Session Stats',
    action: async () => {
      // Get all cards
      const allCards = await plugin.card.findAll({});
      
      // Process flashcard responses
      const responseData = await getNumberRepetitionsGroupedByScore(allCards);
      
      await plugin.app.toast(`Session summary: ${completedCardsCount} cards completed, ${createdCardsCount} cards created, ${createdRemsCount} Rems created, ${queuedCardsCount} cards queued, ${pendingXP} XP pending sync`, {
        type: 'info',
      });
      
      // Show detailed response data
      await plugin.app.toast(`Flashcard responses since last sync: Easy: ${responseData["Easily Recalled"]}, Good: ${responseData["Recalled with Effort"]}, Hard: ${responseData["Partially Recalled"]}, Fail: ${responseData["Forgot"]}`, {
        type: 'info',
      });
    },
  });

  // Create a widget that shows session stats
  await plugin.widgets.registerWidget({
    id: 'habitica-stats-widget',
    name: 'Habitica Stats',
    location: WidgetLocation.RightSidebar,
    render: async () => {
      // Get Habitica user data
      const userData = await getHabiticaUserData();
      
      // Get all cards
      const allCards = await plugin.card.findAll({});
      
      // Process flashcard data
      const responseData = await getNumberRepetitionsGroupedByScore(allCards);
      
      let statsHtml = '<div class="habitica-stats">';
      statsHtml += '<h3>Habitica Stats</h3>';
      
      if (userData) {
        const stats = userData.stats;
        statsHtml += `<p><strong>Level:</strong> ${stats.lvl}</p>`;
        statsHtml += `<p><strong>XP:</strong> ${Math.floor(stats.exp)}/${Math.floor(stats.toNextLevel)}</p>`;
        statsHtml += `<p><strong>HP:</strong> ${Math.floor(stats.hp)}/${stats.maxHealth}</p>`;
        statsHtml += `<p><strong>Gold:</strong> ${Math.floor(stats.gp)}</p>`;
        
        // Show pending changes
        if (pendingXP > 0 || pendingHPReduction < 0) {
          statsHtml += '<h3>Pending Updates</h3>';
          if (pendingXP > 0) {
            statsHtml += `<p><strong>XP to add:</strong> +${pendingXP}</p>`;
          }
          if (pendingHPReduction < 0) {
            statsHtml += `<p><strong>HP change:</strong> ${pendingHPReduction}</p>`;
          }
        }
      } else {
        statsHtml += '<p>Not connected to Habitica</p>';
      }
      
      statsHtml += '<h3>Session Stats</h3>';
      statsHtml += `<p><strong>Cards Completed:</strong> ${completedCardsCount}</p>`;
      statsHtml += `<p><strong>Cards Created:</strong> ${createdCardsCount}</p>`;
      statsHtml += `<p><strong>Rems Created:</strong> ${createdRemsCount}</p>`;
      statsHtml += `<p><strong>Cards Queued:</strong> ${queuedCardsCount}</p>`;
      
      // Add flashcard response summary
      statsHtml += '<h3>Flashcard Responses (since last sync)</h3>';
      statsHtml += `<p><strong>Easy:</strong> ${responseData["Easily Recalled"]}</p>`;
      statsHtml += `<p><strong>Good:</strong> ${responseData["Recalled with Effort"]}</p>`;
      statsHtml += `<p><strong>Hard:</strong> ${responseData["Partially Recalled"]}</p>`;
      statsHtml += `<p><strong>Fail:</strong> ${responseData["Forgot"]}</p>`;
      statsHtml += `<p><strong>Skip:</strong> ${responseData["Skip"]}</p>`;
      
      // Use a dynamic import for the sync button
      statsHtml += '<button class="habitica-sync-button" id="habitica-sync-button">Sync Now</button>';
      statsHtml += '</div>';
      
      return {
        html: statsHtml,
        css: '',
      };
    },
  });

  // Listen for sync event from widget
  plugin.event.addListener('habitica-sync', undefined, async () => {
    await syncWithHabitica();
  });

  // Add event listener for the sync button
  const syncButton = document.getElementById('habitica-sync-button');
  if (syncButton) {
    syncButton.addEventListener('click', () => {
      await plugin.messaging.broadcast({anyDataGoesHere: 'awesome!'});
    });
  }

  // CSS styles for the plugin
  const cssForPlugin = `
    .habitica-sync-button {
      background-color: #7b68ee;
      color: white;
      border: none;
      padding: 5px 10px;
      border-radius: 4px;
      cursor: pointer;
    }
    
    .habitica-sync-button:hover {
      background-color: #6a5acd;
    }
    
    .habitica-stats {
      padding: 10px;
      background-color: #f9f9f9;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    
    .habitica-stats h3 {
      margin-top: 0;
      color: #7b68ee;
    }
  `;

  // Register CSS
  await plugin.app.registerCSS('App', cssForPlugin);
  
  // Set up a periodic sync check
  setInterval(async () => {
    if (await shouldSyncNow() && (pendingXP > 0 || pendingHPReduction < 0)) {
      await syncWithHabitica();
    }
  }, 60000); // Check every minute
}

async function onDeactivate(_: ReactRNPlugin) {
  // Clean up code when your plugin is deactivated
}

declareIndexPlugin(onActivate, onDeactivate);