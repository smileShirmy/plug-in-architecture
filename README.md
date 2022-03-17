## 简介

插件化架构（Plug-in Architecture）就是把功能都拆分成插件，允许我们将应用程序的不同功能作为插件添加到应用程序中，从而提高了程序的扩展性和隔离。插件化架构主要包括两种类型的架构组件：**核⼼系统（Core System）和插件模块（Plug-in modules）**。

插件化架构的本质就是将可能需要不断变化的部分封装在插件中，从⽽达到快速灵活扩展的⽬的，⽽⼜不影响整体系统的稳定。插件模块之间通常是独⽴的，也有⼀些插件是依赖于若⼲其它插件的。但是，需要尽量减少插件之间的通信以避免依赖的问题。

插件化架构的优点主要有：灵活性高（插件之间低耦合，核心系统稳定且快速，具有健壮性）；可测试性（插件可以独立测试）；性能高（可以自定义或剪裁掉不需要的功能）

## 实现

可以把代码拉下来看，更加直观：[PlugIn Architecture demo](http://192.168.199.95/docs/plug-in-architecture)

插件系统主要有三个关键点：插件管理、插件连接和插件通信

### 1. 插件管理

为了做好插件的管理，需要约定插件的开发规范，插件是一个类，并且需要有以下特性：

1. 静态的 pluginName 属性
2. 实现 PluginAPI 的接口，把插件模块向外暴露的方法代理的核心系统上
3. 插件的构造函数 constructor 第一个参数是核心系统的实例，通过核心系统的实例的**事件**或**钩子**注入插件的逻辑

下面举一个直观的例子，假设我们有一个 Refresh 插件模块

```ts
// Refresh.ts
interface PluginAPI {
  refresh(): void;
}

// 实现 PluginAPI 定义的方法，用于给用户调用
export default class Refresh implements PluginAPI {
  // 静态 pluginName 属性
  static pluginName = 'refresh'
  // 参数是核心系统的实例，这样便可以使用核心系统的实例的 事件 或 钩子 注入插件的逻辑
  constructor(public core: Core) {
    this.init()
  }
}
```

### 2. 插件连接

对于核心系统，它需要知道有什么插件可用，如何加载这些插件，什么时候加载插件，常用的方法是插件注册表辑之。核心系统提供插件注册表（配置文件、代码、数据库等），插件注册表含有每个插件模块的信息，包括它的名字、位置、加载时机（启动就加载、或是按需加载）等。

这里继续以 Refresh 插件为例，我们这样注册插件：

```ts
import Core from '@example/core'
import Refresh from '@example/refresh'

// 注册插件
Core.use(Refresh)

// 实例化时传入 Refresh 插件的配置项
new Core({
  disableRefresh: true
})
```

接下来我们看 `Core.use(Refresh)` 是如何实现插件注册的：

```ts
// Core.ts

// 插件构造函数的类型描述
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

export class CoreConstructor<O = {}> extends EventEmitter {
  static plugins: PluginItem[] = [];
  static pluginsMap: PluginsMap = {};

  // use 静态方法接收一个 PluginCtor 类型的插件
  static use(ctor: PluginCtor) {
    const name = ctor.pluginName;
    // 判断插件是否已经注册过
    const installed = CoreConstructor.plugins.some(
      plugin => ctor === plugin.ctor
    );

    if (installed) return CoreConstructor;
    // 注册插件，把插件信息保存到 pluginsMap 和 plugins 中
    CoreConstructor.pluginsMap[name] = true;
    CoreConstructor.plugins.push({
      name,
      applyOrder: ctor.applyOrder,
      ctor
    });
    /**
     * 返回 CoreConstructor 对象是为了可以链式调用
     * 
     * 比如 Core.use(Refresh).use(Scroll)
     */
    return CoreConstructor;
  }
}
```

通过 `Core.use()` 获取了插件信息后，我们需要在 Core 的构造函数中应用已注册的插件

```ts
// Core.ts
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

// createCore 函数是为了取代 new Core() 而通过工厂函数的方式创建
export function createCore<O = {}>(
  options?: Options & O
): CoreConstructor & UnionToIntersection<ExtractAPI<O>> {
  const core = new CoreConstructor(options);
  return (core as unknown) as CoreConstructor &
    UnionToIntersection<ExtractAPI<O>>;
}

/**
 * 把 CoreConstructor 的静态方法和静态属性连接到 createCore 函数，如此一来便可以通过s
 * 
 * createCore.use(Refresh);
 * createCore({ enableRefresh: true })
 * 
 * 这样的方式来创建实例
 */
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
```

接下来看 `CoreConstructor` 是如何创建实例的

```ts
// Core.ts
export class CoreConstructor<O = {}> extends EventEmitter {
  static plugins: PluginItem[] = [];
  static pluginsMap: PluginsMap = {};
  options: OptionsConstructor;
  plugins: { [name: string]: any };
  hooks: EventEmitter;

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

    /**
     * OptionsConstructor 定义了配置类型及配置的默认值
     * 
     * // Options.ts
     * export interface DefOptions {
     *   [key: string]: any;
     *   startX?: number;
     *   startY?: number;
     * }
     * 
     * export class CustomOptions {}
     * 
     * export interface Options extends DefOptions, CustomOptions {}
     * 
     * export class OptionsConstructor extends CustomOptions implements DefOptions {
     *   [key: string]: any;
     *   startX: number;
     *   startY: number;
     * 
     *   constructor() {
     *     super();
     *     this.startX = 0;
     *     this.startY = 0;
     *   }
     * 
     *   merge(options?: Options) {
     *     if (!options) return this;
     *     for (let key in options) {
     *       this[key] = options[key];
     *     }
     *     return this;
     *   }
     * }
     */ 
    this.options = new OptionsConstructor().merge(options);
    this.plugins = {};
    this.hooks = new EventEmitter([
      /* 核心系统钩子，本质与事件相同，都是 EventEmitter 实例，也就是典型的订阅发布模式 */
    ]);
    this.init();
  }

  init() {
    // 其他初始化逻辑

    // 应用插件
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
```

### 3. 插件通信

虽然插件间是完全解耦的，但是实际业务中必然回出现某个业务流程需要多个插件协作，这就需要两个插件间进行通信；用于插件间没有直接联系，因此需要通过通信系统提供的插件通信机制（这就类似计算机的总线连接各个硬件设备）。

这个通信机制是基于典型的订阅发布模式来实现的，因此我们的核心系统继承了 `EventEmitter` 类（`class CoreConstructor<O = {}> extends EventEmitter`）：

```ts
// events.ts
import { warn } from './debug';

interface WithFnFunction extends Function {
  fn?: Function;
}

interface Events {
  [name: string]: [WithFnFunction, Object][];
}

interface EventTypes {
  [type: string]: string;
}

export class EventEmitter {
  events: Events;
  eventTypes: EventTypes;
  constructor(names: string[]) {
    this.events = {};
    this.eventTypes = {};
    this.registerType(names);
  }

  // 永久注册
  on(type: string, fn: Function, context: Object = this) {
    this.hasType(type);
    if (!this.events[type]) {
      this.events[type] = [];
    }

    this.events[type].push([fn, context]);
    return this;
  }

  // 一次注册
  once(type: string, fn: Function, context: Object = this) {
    this.hasType(type);
    const magic = (...args: any[]) => {
      this.off(type, magic);
      const ret = fn.apply(context, args);
      if (ret === true) {
        return ret;
      }
    };
    magic.fn = fn;

    this.on(type, magic);
    return this;
  }

  off(type?: string, fn?: Function) {
    if (!type && !fn) {
      this.events = {};
      return this;
    }

    if (type) {
      this.hasType(type);
      if (!fn) {
        this.events[type] = [];
        return this;
      }

      let events = this.events[type];
      if (!events) {
        return this;
      }

      let count = events.length;
      while (count--) {
        if (
          events[count][0] === fn ||
          (events[count][0] && events[count][0].fn === fn)
        ) {
          events.splice(count, 1);
        }
      }

      return this;
    }
  }

  // 触发事件
  trigger(type: string, ...args: any[]) {
    this.hasType(type);
    let events = this.events[type];
    if (!events) {
      return;
    }

    let len = events.length;
    let eventsCopy = [...events];
    let ret;
    for (let i = 0; i < len; i++) {
      let event = eventsCopy[i];
      let [fn, context] = event;
      if (fn) {
        ret = fn.apply(context, args);
        if (ret === true) {
          return ret;
        }
      }
    }
  }

  registerType(names: string[]) {
    names.forEach((type: string) => {
      this.eventTypes[type] = type;
    });
  }

  destroy() {
    this.events = {};
    this.eventTypes = {};
  }

  private hasType(type: string) {
    const types = this.eventTypes;
    const isType = types[type] === type;
    if (!isType) {
      warn(
        `EventEmitter has used unknown event type: "${type}", should be oneof [` +
          `${Object.keys(types).map(_ => JSON.stringify(_))}` +
          `]`
      );
    }
  }
}
```

有了 `EventEmitter` 之后，我们就可以通过发布订阅那一套来实现通信了，这里还是以 Refresh 插件为例：

```ts
// refresh/index.ts
import { Core } from '@example/core';
import { EventEmitter } from '@example/shared';

export interface RefreshConfig {}

export type RefreshOptions = Partial<RefreshConfig> | true;

// 给 core 实例声明 refresh() 方法以实现接口合并，这样就可以在实例上调用 core.refresh() 方法
declare module '@example/core' {
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
    // 注册 refresh 钩子
    this.core.registerType([REFRESH_HOOKS_NAME]);
  }

  private handleHooks() {
    this.hooksFn = [];

    // 当核心系统触发 contentChanged 事件时的事件处理（订阅 contentChanged 事件，类似于 addEventListener('contentChanged', () => { /*/ })）
    this.registerHooks(
      this.core.hooks,
      this.core.hooks.eventTypes.contentChanged,
      () => {
        // 事件处理
      }
    );
  }

  /**
   * 事件监听
   * @param {EventEmitter} hooks EventEmitter 对象
   * @param {string} name 事件名
   * @param {Function} handler 事件处理器
   */
  private registerHooks(hooks: EventEmitter, name: string, handler: Function) {
    hooks.on(name, handler, this);
    this.hooksFn.push([hooks, name, handler]);
  }

  private example() {
    // 满足一定逻辑条件后派发插件的内部事件
    this.core.trigger(REFRESH_HOOKS_NAME);
  }

  refresh() {
    // ...
  }
}
```

## 工程化

为了做好插件化架构，我们可以使用 `lerna`，他一个多包管理工具，我们可以把不同的插件放到不同的包中分开发布，如`@example/core`、`@example/pluginA`、`@example/shared`

除此之外，就是 `prettier`、`tslint`、`commitizen`、`husky`、`jest`、`coveralls`、`vuepress` 之类的东西了，这些东西根据实际需要扩充即可，主要还是 `lerna` 非常适合做这种插件化架构

## 参考源码

- [better-scroll](https://github.com/ustbhuangyi/better-scroll)