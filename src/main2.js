import { declareIndexPlugin, ReactRNPlugin, WidgetLocation, AppEvents } from '@remnote/plugin-sdk';

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
    defaultValue: 0.1,
  });

  await plugin.settings.registerNumberSetting({
    id: 'xpPerCreatedCard',
    title: 'XP Per Created Flashcard',
    description: 'How much XP to award per flashcard created',
    defaultValue: 5,
  });

  // Create a widget to display stats
  await plugin.widgets.registerWidget('habitica_stats', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
  });

  // Stats for the current session
  let sessionStats = {
    cardsCreated: 0,
    reviewedEasy: 0,
    reviewedGood: 0,
    reviewedHard: 0,
    reviewedFail: 0
  };

  // Listen for flashcard practice events
  plugin.event.addListener(
    AppEvents.AFTER_FLASHCARD_RESPONDED, 
    async (response) => {
      // Determine the performance level and award XP accordingly
      const performance = response.feedback; // This might need adjustment based on actual API
      let xpAmount = 0;
      let reduceHP = false;
      
      switch(performance) {
        case 'easy':
          xpAmount = await plugin.settings.getSetting('xpEasy') as number;
          sessionStats.reviewedEasy++;
          break;
        case 'good':
          xpAmount = await plugin.settings.getSetting('xpGood') as number;
          sessionStats.reviewedGood++;
          break;
        case 'hard':
          xpAmount = await plugin.settings.getSetting('xpHard') as number;
          sessionStats.reviewedHard++;
          break;
        case 'fail':
          const hpAmount = await plugin.settings.getSetting('hpFail') as number;
          reduceHP = true;
          sessionStats.reviewedFail++;
          await reduceHabiticaHP(hpAmount, 'Failed Flashcard');
          break;
      }
      
      // Update the widget with current stats
      updateStatsWidget();
      
      // Award XP in Habitica if not a failed card
      if (xpAmount > 0 && !reduceHP) {
        await awardHabiticaXP(xpAmount, `Flashcard Review (${performance})`);
      }
    }
  );

  // Listen for flashcard creation events
  plugin.event.addListener(
    AppEvents.FLASHCARD_CREATED, 
    async (flashcard) => {
      // Increment creation counter when a flashcard is created
      sessionStats.cardsCreated++;
      
      // Update the widget with current stats
      updateStatsWidget();
      
      // Get XP per created card from settings
      const xpPerCreatedCard = await plugin.settings.getSetting('xpPerCreatedCard');
      
      // Award XP in Habitica for creation
      await awardHabiticaXP(xpPerCreatedCard as number, 'Flashcard Creation');
    }
  );

  // Function to update the stats widget
  async function updateStatsWidget() {
    await plugin.widgets.updateRender('habitica_stats', 
      `<div style="padding: 10px;">
        <h3>Habitica Integration</h3>
        <h4>Session Stats:</h4>
        <p><b>Cards Created:</b> ${sessionStats.cardsCreated}</p>
        <p><b>Reviews by Performance:</b></p>
        <ul style="list-style-type: none; padding-left: 10px;">
          <li>Easy: ${sessionStats.reviewedEasy}</li>
          <li>Good: ${sessionStats.reviewedGood}</li>
          <li>Hard: ${sessionStats.reviewedHard}</li>
          <li>Fail: ${sessionStats.reviewedFail}</li>
        </ul>
        <button id="sync-habitica" style="padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">
          Manual Sync to Habitica
        </button>
      </div>`
    );
    
    // Add click handler for manual sync
    document.getElementById('sync-habitica')?.addEventListener('click', async () => {
      const xpEasy = await plugin.settings.getSetting('xpEasy') as number;
      const xpGood = await plugin.settings.getSetting('xpGood') as number;
      const xpHard = await plugin.settings.getSetting('xpHard') as number;
      const xpPerCreatedCard = await plugin.settings.getSetting('xpPerCreatedCard') as number;
      
      // Calculate total XP
      const totalXP = (sessionStats.reviewedEasy * xpEasy) + 
                     (sessionStats.reviewedGood * xpGood) + 
                     (sessionStats.reviewedHard * xpHard) + 
                     (sessionStats.cardsCreated * xpPerCreatedCard);
      
      // Award total XP
      if (totalXP > 0) {
        await awardHabiticaXP(totalXP, 'RemNote Flashcard Activity (Manual Sync)');
      }
      
      // Reset session stats
      sessionStats = {
        cardsCreated: 0,
        reviewedEasy: 0,
        reviewedGood: 0,
        reviewedHard: 0,
        reviewedFail: 0
      };
      updateStatsWidget();
    });
  }

  // Function to award XP in Habitica
  async function awardHabiticaXP(xpAmount: number, activityType: string) {
    try {
      const userId = await plugin.settings.getSetting('habiticaUserId') as string;
      const apiKey = await plugin.settings.getSetting('habiticaApiKey') as string;
      
      if (!userId || !apiKey) {
        console.error('Habitica credentials not set');
        return;
      }
      
      const response = await fetch('https://habitica.com/api/v3/user/score/up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-user': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          type: 'reward',
          scoreNotes: `RemNote ${activityType}: ${xpAmount} XP`,
          amount: xpAmount,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`Successfully awarded ${xpAmount} XP in Habitica for ${activityType}`);
      } else {
        console.error(`Failed to award XP in Habitica for ${activityType}`, data);
      }
    } catch (error) {
      console.error(`Error awarding XP in Habitica for ${activityType}`, error);
    }
  }

  // Function to reduce HP in Habitica
  async function reduceHabiticaHP(hpAmount: number, activityType: string) {
    try {
      const userId = await plugin.settings.getSetting('habiticaUserId') as string;
      const apiKey = await plugin.settings.getSetting('habiticaApiKey') as string;
      
      if (!userId || !apiKey) {
        console.error('Habitica credentials not set');
        return;
      }
      
      const response = await fetch('https://habitica.com/api/v3/user/score/down', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-user': userId,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          type: 'reward',
          scoreNotes: `RemNote ${activityType}: ${hpAmount} HP reduction`,
          amount: hpAmount,
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`Successfully reduced ${hpAmount} HP in Habitica for ${activityType}`);
      } else {
        console.error(`Failed to reduce HP in Habitica for ${activityType}`, data);
      }
    } catch (error) {
      console.error(`Error reducing HP in Habitica for ${activityType}`, error);
    }
  }

  // Initialize the widget on load
  updateStatsWidget();
}

async function onDeactivate(_: ReactRNPlugin) {
  // Clean up code when your plugin is deactivated
}

declareIndexPlugin(onActivate, onDeactivate);