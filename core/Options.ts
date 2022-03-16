export interface DefOptions {
  [key: string]: any;
  startX?: number;
  startY?: number;
}

export class CustomOptions {}

export interface Options extends DefOptions, CustomOptions {}

export class OptionsConstructor extends CustomOptions implements DefOptions {
  [key: string]: any;
  startX: number;
  startY: number;

  constructor() {
    super();
    this.startX = 0;
    this.startY = 0;
  }

  merge(options?: Options) {
    if (!options) return this;
    for (let key in options) {
      this[key] = options[key];
    }
    return this;
  }
}
