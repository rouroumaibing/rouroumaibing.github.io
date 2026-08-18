'use strict';

// 修复 hexo-image-opt（1.1.6）的图片路径问题
// ------------------------------------------------------------
// 该插件把 <img> 转成 <picture> 时，写的是「裸相对路径」，例如：
//     opt-images/foo-optimized.png
//     opt-images/foo-400w.webp
// 在嵌套文章页（https://user.github.io/2026/08/18/post/）下，浏览器会按
// 当前页面 URL 解析成 .../post/opt-images/... 从而导致 404，图片全部加载不出来。
//
// 这里统一改写成「根相对路径」（利用 Hexo 的 root 配置），例如 /opt-images/...，
// 这样无论页面深度、在 GitHub Pages 上都能正确加载。
//
// ★ 自愈逻辑（2026-08-18 增加）：
//   如果 HTML 里已经没有「裸相对路径」的 opt-images 引用（比如社区插件自己修好了、
//   或者改用了根相对路径），本脚本就什么都不做、直接原样返回。这样一旦上游修复，
//   脚本会自动让路，不会因为重复加斜杠把路径弄坏。
//   判定方式：扫描所有 "opt-images/" 出现位置，凡前面不是 "/" 的，视为「还没修好」。
//
// 注意执行顺序：Hexo 的 after_render:html 过滤器按优先级「数字升序」执行
// （数字越小越先跑）。hexo-image-opt 自身用默认优先级 10，因此本过滤器必须用
// 更大的数字（这里用 20）才能在它「之后」执行，拿到它已转换好的 <picture> 再修路径。
// 该脚本放在仓库 scripts/ 下，会随源码提交，在 GitHub Actions 的 CI 构建中同样生效。
hexo.extend.filter.register('after_render:html', function (str) {
  if (typeof str !== 'string' || str.length === 0) {
    return str;
  }

  // 1) 前置判断：是否存在「尚未修复」的裸相对路径 opt-images/
  //    前面不是 "/"（即非根相对）的，才算需要修。
  var needsFix = false;
  var idx = str.indexOf('opt-images/');
  while (idx !== -1) {
    var prev = idx === 0 ? '' : str.charAt(idx - 1);
    if (prev !== '/') {
      needsFix = true;
      break;
    }
    idx = str.indexOf('opt-images/', idx + 1);
  }

  if (!needsFix) {
    // 路径已经正确（例如社区插件已修复 / 已用根相对），直接放行，不做任何替换。
    if (hexo && hexo.log && hexo.log.debug) {
      hexo.log.debug('[fix-image-opt-paths] opt-images 路径已正确，跳过替换');
    }
    return str;
  }

  // 2) 确实需要修：把所有「前面不是 / 的 opt-images/」改成根相对路径。
  var root = (hexo.config.root || '/').replace(/\/$/, '');
  var base = root + '/opt-images/';
  var count = 0;
  var out = str.replace(/(^|[^/])opt-images\//g, function (m, p1) {
    count += 1;
    return p1 + base;
  });

  if (hexo && hexo.log && hexo.log.debug) {
    hexo.log.debug('[fix-image-opt-paths] 已修复 ' + count + ' 处 opt-images 路径 -> ' + base);
  }
  return out;
}, 20);

