import { usePlugin, renderWidget, useTracker } from '@remnote/plugin-sdk';

export const habitica_stats = () => {
  const plugin = usePlugin();

let userid = useTracker(() => plugin.settings.getSetting<string>('habiticaUserId'));
let apikey = useTracker(() => plugin.settings.getSetting<string>('habiticaApiKey'));
let xpEasy = useTracker(() => plugin.settings.getSetting<number>('xpEasy'));
let xpGood = useTracker(() => plugin.settings.getSetting<number>('xpGood'));
let xpHard = useTracker(() => plugin.settings.getSetting<number>('xpHard'));
let hpFail = useTracker(() => plugin.settings.getSetting<number>('hpFail'));
let xpPerCreatedCard = useTracker(() => plugin.settings.getSetting<number>('xpPerCreatedCard'));

return (
    <div className="p-2 m-2 rounded-lg rn-clr-background-light-positive rn-clr-content-positive">
      <h1 className="text-xl">Habitica Plugin</h1>
      <div>
      <div> userid = {'userid'} </div>
      <div> apikey = {'apikey'} </div>
      <div> xpEasy = {'xpEasy'} </div>
      <div> xpGood = {'xpGood'} </div>
      <div> xpHard = {'xpHard'} </div>
      <div> hpFail = {'hpFail'} </div>
      <div> xpPerCreatedCard  = {'xpPerCreatedCard '} </div>
      </div>
    </div>
  );
};

renderWidget(habitica_stats);
