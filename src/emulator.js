import { Settings } from './settings.js';
import { DomResolver } from './domResolver.js';
import { Notify } from './notify.js';
import { Computer } from './computer.js';

export class Emulator {
  constructor(profile) {
    this.settings = new Settings(profile);
    this.dom = new DomResolver(this.settings);

    Notify.create(this.dom.notify, this.settings.notify.delay);

    this.computer = new Computer(this.settings, this.dom);
  }

  async initAsync() {
    this.init(); // UI setup
    await this.computer.initAsync();
  }

  init() {
    if (this.dom.help_button) {
      const node = document.getElementById(this.dom.help_button.dataset.target);
      const clickOnHelpButtonHandler = () => {
        node.classList.add('lightbox_show');

        const clickOnCloseButtonHanlder = (e) => {
          if (e.target.dataset.action === 'close') {
            node.classList.remove('lightbox_show');
            node.removeEventListener('click', clickOnCloseButtonHanlder);
          }
        };
        node.addEventListener('click', clickOnCloseButtonHanlder);
      };
      document.addEventListener('ui:click:help_button', clickOnHelpButtonHandler);

      this.dom.help_button.addEventListener('click', (e) => {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('ui:click:help_button'));
      });
    }
  }

  run() {
    this.computer.run();
  }
}
