import { ApplyOrder } from '../utils/enums';
import { EventEmitter } from '../utils/events';
import { UnionToIntersection } from '../utils/typesHelper';
import { CoreInstance } from './instance';
import {
  Options,
  OptionsConstructor,
  CustomOptions,
  DefOptions
} from './Options';

// 描述插件构造函数的特点
interface PluginCtor {
  pluginName: string;
  applyOrder?: ApplyOrder;
  new (core: Core): any;
}

interface PluginItem {
  name: string;
  applyOrder?: ApplyOrder.Pre | ApplyOrder.Post;
  ctor: PluginCtor;
}

interface PluginsMap {
  [key: string]: boolean;
}

export interface CoreConstructor extends CoreInstance {}

export class CoreConstructor<O = {}> extends EventEmitter {
  static plugins: PluginItem[] = [];
  static pluginsMap: PluginsMap = {};
  options: OptionsConstructor;
  plugins: { [name: string]: any };
  hooks: EventEmitter;

  // 判断插件是否已经注册过，如果没有则进行注册
  static use(ctor: PluginCtor) {
    const name = ctor.pluginName;
    const installed = CoreConstructor.plugins.some(
      plugin => ctor === plugin.ctor
    );

    if (installed) return CoreConstructor;
    CoreConstructor.pluginsMap[name] = true;
    CoreConstructor.plugins.push({
      name,
      applyOrder: ctor.applyOrder,
      ctor
    });
    return CoreConstructor;
  }

  constructor(options?: Options & O) {
    super([
      /* 核心系统事件 */
    ]);

    this.options = new OptionsConstructor().merge(options);
    this.plugins = {};
    this.hooks = new EventEmitter([
      /* 核心系统钩子 */
    ]);
    this.init();
  }

  init() {
    // 其他初始化逻辑

    this.applyPlugins();
  }

  private applyPlugins() {
    const options = this.options;

    // 根据插件设置顺序进行排序
    CoreConstructor.plugins
      .sort((a, b) => {
        const applyOrderMap = {
          [ApplyOrder.Pre]: -1,
          [ApplyOrder.Post]: 1
        };
        const aOrder = a.applyOrder ? applyOrderMap[a.applyOrder] : 0;
        const bOrder = b.applyOrder ? applyOrderMap[b.applyOrder] : 0;
        return aOrder - bOrder;
      })
      .forEach((item: PluginItem) => {
        const ctor = item.ctor;
        // 当启⽤指定插件的时候且插件构造函数的类型是函数的话，再创建对应的插件
        if (options[item.name] && typeof ctor === 'function') {
          // 把插件实例保存到 plugins 属性
          this.plugins[item.name] = new ctor(this);
        }
      });
  }
}

export interface CustomAPI {
  [key: string]: {};
}

type ExtractAPI<O> = {
  [K in keyof O]: K extends string
    ? DefOptions[K] extends undefined
      ? CustomAPI[K]
      : never
    : never;
}[keyof O];

export function createCore<O = {}>(
  options?: Options & O
): CoreConstructor & UnionToIntersection<ExtractAPI<O>> {
  const core = new CoreConstructor(options);
  return (core as unknown) as CoreConstructor &
    UnionToIntersection<ExtractAPI<O>>;
}

createCore.use = CoreConstructor.use;
createCore.plugins = CoreConstructor.plugins;
createCore.pluginsMap = CoreConstructor.pluginsMap;

type createCore = typeof createCore;
export interface CoreFactory extends createCore {
  new <O = {}>(options?: Options & O): CoreConstructor &
    UnionToIntersection<ExtractAPI<O>>;
}

export type Core<O = Options> = CoreConstructor<O> &
  UnionToIntersection<ExtractAPI<O>>;

export const Core = (createCore as unknown) as CoreFactory;
