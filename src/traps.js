const TRAP_PROFILES = {
  default: [
    {
      addr: 0xdd94, //Подмена для BLOAD
      handler() {
        const signalIoError = function () {
          this.cpu.execute(0xe5);
          this.cpu.execute(0xd5);
          this.cpu.execute(0xc5);
          this.cpu.jump(0xe4c7);
          this.resume();
        }.bind(this);

        const install = function () {
          if (this.bload(this.get_file())) {
            this.cpu.gosub(0xe48a);
            this.cpu.jump(0xdd61);
            this.resume();
          } else {
            signalIoError();
          }
          this.detach_file();
        }.bind(this);

        this.suspend();

        if (this.exists_attached_file()) {
          install();
        } else if (this.hasTape()) {
          this.tape.load().then((file) => {
            this.attach_file(file);
            install();
          }, signalIoError);

          return this.cpu.getNopeOptcode();
        } else {
          signalIoError();
        }

        return this.cpu.getUndefOptcode();
      },
    },
    {
      addr: 0xe50b, //Подмена для CLOAD (1)
      handler() {
        const signalIoError = function () {
          this.cpu.execute(0xe5);
          this.cpu.execute(0xd5);
          this.cpu.execute(0xc5);
          this.cpu.jump(0xe4c7);
          this.resume();
        }.bind(this);

        const install = function () {
          if (this.cload(this.get_file())) {
            this.cpu.gosub(0xe48a);
            this.cpu.jump(0xe26d);
            this.resume();
          } else {
            signalIoError();
          }
          this.detach_file();
        }.bind(this);

        this.suspend();

        if (this.exists_attached_file()) {
          install();
        } else if (this.hasTape()) {
          this.tape.load().then((file) => {
            this.attach_file(file);
            install();
          }, signalIoError);

          return this.cpu.getNopeOptcode();
        } else {
          signalIoError();
        }

        return this.cpu.getUndefOptcode();
      },
    },
    {
      addr: 0xe55e, //Подмена для CLOAD (2)
      handler() {
        return (this.cpu.jump(0xe561), this.cpu.getUndefOptcode());
      },
    },
  ],
};

export class Traps {
  constructor() {
    this.traps = new Map();
  }

  activate(profile, ctx) {
    if (!(profile in TRAP_PROFILES)) {
      throw new Error('TRAPS: Invalid PROFILE param');
    }

    const traps = TRAP_PROFILES[profile];
    for (const trap of traps) {
      this.traps.set(Number(trap.addr), trap.handler.bind(ctx));
    }
  }

  handle(addr) {
    const handler = this.traps.get(addr);
    return handler();
  }

  has(addr) {
    return this.traps.has(addr);
  }
}
