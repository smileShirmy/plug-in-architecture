import { Core } from '../core/Core';
import { EventEmitter } from '../utils/events';

export interface RefreshConfig {}

export type RefreshOptions = Partial<RefreshConfig> | true;

// 实现接口合并
declare module '../core' {
  interface CustomOptions {
    refresh?: RefreshOptions;
  }

  interface CustomAPI {
    refresh: PluginAPI;
  }
}

interface PluginAPI {
  refresh(): void;
}

const REFRESH_HOOKS_NAME = 'refresh';

export default class Refresh implements PluginAPI {
  static pluginName = 'refresh';
  private hooksFn: Array<[EventEmitter, string, Function]> = [];
  // Core 实例被保存到内部的 core 属性中
  constructor(public core: Core) {
    this.init();
  }

  init() {
    this.handleCore();

    this.handleHooks();
  }

  private handleCore() {
    this.core.registerType([REFRESH_HOOKS_NAME]);
  }

  private handleHooks() {
    this.hooksFn = [];

    this.registerHooks(
      this.core.hooks,
      this.core.hooks.eventTypes.contentChanged,
      () => {
        // 事件处理
      }
    );
  }

  /**
   * 注册钩子
   * @param {EventEmitter} hooks EventEmitter 对象
   * @param {string} name 事件名
   * @param {Function} handler 事件处理器
   */
  private registerHooks(hooks: EventEmitter, name: string, handler: Function) {
    hooks.on(name, handler, this);
    this.hooksFn.push([hooks, name, handler]);
  }

  refresh() {
    // 派发插件的内部事件
    this.core.trigger(REFRESH_HOOKS_NAME);
  }
}
