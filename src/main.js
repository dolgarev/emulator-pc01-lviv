import { Emulator } from './emulator.js';
import { AudioSink } from './audioSink.js';

document.addEventListener('DOMContentLoaded', async () => {
  const emulator = new Emulator();
  await emulator.initAsync();
  emulator.run();

  // Modern browsers require user interaction to resume audio
  const audioActivator = function () {
    console.log('MAIN: User interaction detected, activating sound...');
    const context = AudioSink.activate();
    if (context) {
      if (context.state === 'suspended') {
        context.resume().then(() => {
          console.log('MAIN: AudioContext resumed. New state:', context.state);
        });
      } else {
        console.log('MAIN: AudioContext already active. State:', context.state);
      }
    }
  };

  document.addEventListener('click', audioActivator, { once: true });
  document.addEventListener('keydown', audioActivator, { once: true });
});
