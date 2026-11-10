import { useEffect, useRef } from 'react';
import { useI18n } from './i18n';

type CloudWord = { text: string; weight: number };

const ZH_WORDS: CloudWord[] = [
  { text: '工时填报', weight: 10 },
  { text: '审批流程', weight: 8.4 },
  { text: '数据导出', weight: 7.6 },
  { text: '权限管理', weight: 6.8 },
  { text: '移动端', weight: 6.1 },
  { text: '提醒通知', weight: 5.7 },
  { text: '模板配置', weight: 5.2 },
  { text: '填写体验', weight: 4.8 },
  { text: '页面样式', weight: 4.4 },
  { text: '加载速度', weight: 4.1 },
  { text: '多语言', weight: 3.8 },
  { text: '历史记录', weight: 3.5 },
  { text: '批量操作', weight: 3.2 },
  { text: '数据同步', weight: 3.0 },
  { text: '工作项', weight: 2.8 },
  { text: '反馈入口', weight: 2.6 },
];

const EN_WORDS: CloudWord[] = [
  { text: 'Time entry', weight: 10 },
  { text: 'Approval', weight: 8.4 },
  { text: 'Export', weight: 7.6 },
  { text: 'Permissions', weight: 6.8 },
  { text: 'Mobile', weight: 6.1 },
  { text: 'Reminders', weight: 5.7 },
  { text: 'Templates', weight: 5.2 },
  { text: 'Usability', weight: 4.8 },
  { text: 'Visuals', weight: 4.4 },
  { text: 'Speed', weight: 4.1 },
  { text: 'Language', weight: 3.8 },
  { text: 'History', weight: 3.5 },
  { text: 'Bulk edit', weight: 3.2 },
  { text: 'Sync', weight: 3.0 },
  { text: 'Work item', weight: 2.8 },
  { text: 'Feedback', weight: 2.6 },
];

const COLORS = ['#315c46', '#46765b', '#668d77', '#8aa294', '#c06a16', '#6d7c73'];

type PlacedWord = CloudWord & {
  x: number;
  y: number;
  size: number;
  angle: number;
  color: string;
  alpha: number;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
};

function intersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function placeWords(
  ctx: CanvasRenderingContext2D,
  words: CloudWord[],
  width: number,
  height: number,
): PlacedWord[] {
  const sorted = [...words].sort((a, b) => b.weight - a.weight);
  const maxWeight = sorted[0]?.weight ?? 1;
  const maxSize = width < 760 ? 26 : width < 1100 ? 30 : 34;
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const placed: PlacedWord[] = [];
  const random = seededRandom(Math.round(width * 13 + height * 7 + sorted.length * 29));
  const centerX = width / 2;
  const centerY = height / 2;

  for (let index = 0; index < sorted.length; index += 1) {
    const word = sorted[index];
    const ratio = Math.max(0.38, word.weight / maxWeight);
    const size = Math.max(11.5, maxSize * Math.pow(ratio, 0.78));
    const family = '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.font = `600 ${size}px ${family}`;
    const textWidth = ctx.measureText(word.text).width;
    const textHeight = size * 1.08;
    const padX = textWidth / 2 + 9;
    const padY = textHeight / 2 + 7;
    const angle = index % 8 === 3 ? 0.05 : index % 11 === 7 ? -0.04 : 0;
    const spread = index < 4 ? 0.62 : 1;
    let target: { x: number; y: number; w: number; h: number } | null = null;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const gaussianY = (random() + random() + random()) / 3 - 0.5;
      const x = centerX + (random() * 2 - 1) * width * 0.46 * spread;
      const y = centerY + gaussianY * height * 0.76;
      const clampedX = Math.min(width - padX - 8, Math.max(padX + 8, x));
      const clampedY = Math.min(height - padY - 6, Math.max(padY + 6, y));
      const box = {
        x: clampedX,
        y: clampedY,
        w: padX * 2,
        h: padY * 2,
      };
      if (!boxes.some((other) => intersects(box, other))) {
        target = box;
        break;
      }
    }

    if (!target) {
      target = {
        x: Math.min(width - padX - 8, Math.max(padX + 8, centerX + (random() * 2 - 1) * width * 0.4)),
        y: Math.min(height - padY - 6, Math.max(padY + 6, centerY + (random() * 2 - 1) * height * 0.35)),
        w: padX * 2,
        h: padY * 2,
      };
    }
    boxes.push(target);
    placed.push({
      ...word,
      x: target.x,
      y: target.y,
      size,
      angle,
      color: COLORS[index % COLORS.length],
      alpha: 0.7 + Math.min(0.26, word.weight / 45),
      phase: (index * 1.37) % (Math.PI * 2),
      speed: 0.22 + (index % 5) * 0.045,
      driftX: 3.4 + (index % 4) * 0.8,
      driftY: 2.8 + (index % 3) * 0.7,
    });
  }

  return placed;
}

export default function FeedbackWordCloud() {
  const { lang } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      host.removeChild(canvas);
      return;
    }

    const words = lang === 'zh' ? ZH_WORDS : EN_WORDS;
    let placed: PlacedWord[] = [];
    let cssWidth = 0;
    let cssHeight = 0;
    let frame = 0;
    let start = performance.now();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      cssWidth = rect.width;
      cssHeight = rect.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      placed = placeWords(ctx, words, cssWidth, cssHeight);
      start = performance.now();
    };

    const draw = (now: number) => {
      if (!cssWidth || !cssHeight) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      const family = '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif';

      for (const word of placed) {
        const sway = reduceMotion ? 0 : Math.sin(t * word.speed + word.phase);
        const bob = reduceMotion ? 0 : Math.cos(t * word.speed * 0.82 + word.phase);
        const x = word.x + sway * word.driftX;
        const y = word.y + bob * word.driftY;
        const alpha = reduceMotion
          ? word.alpha
          : word.alpha * (0.9 + 0.1 * Math.sin(t * 0.55 + word.phase));

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(word.angle + (reduceMotion ? 0 : sway * 0.006));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = word.color;
        ctx.font = `600 ${word.size}px ${family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word.text, 0, 0);
        ctx.restore();
      }

      if (!reduceMotion) frame = requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.remove();
    };
  }, [lang]);

  return (
    <div
      ref={hostRef}
      className="feedback-cloud"
      role="img"
      aria-label={lang === 'zh' ? '反馈热词词云' : 'Feedback topic word cloud'}
    />
  );
}
