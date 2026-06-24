import * as echarts from 'echarts';

export type StaticChartType =
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'funnel';

export interface StaticChartDatum {
  label: string;
  value: number;
}

export interface StaticChartOptions {
  type?: string;
  title?: string;
  subtitle?: string;
  width?: number;
  height?: number;
  accent?: string;
  secondary?: string;
  background?: string;
  textColor?: string;
}

export interface StaticChartResult {
  type: StaticChartType;
  svg: string;
  width: number;
  height: number;
  library: 'echarts';
}

const DEFAULT_WIDTH = 900;
const DEFAULT_HEIGHT = 520;
const DEFAULT_ACCENT = '#2563EB';
const DEFAULT_SECONDARY = '#2F6B4F';
const DEFAULT_TEXT = '#141512';
const DEFAULT_BACKGROUND = 'transparent';

export function renderStaticChart(
  data: StaticChartDatum[],
  options: StaticChartOptions = {}
): StaticChartResult {
  const width = clampNumber(options.width, 320, 1600, DEFAULT_WIDTH);
  const height = clampNumber(options.height, 240, 1000, DEFAULT_HEIGHT);
  const type = normalizeChartType(options.type);
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  });

  chart.setOption(
    chartOption(type, normalizeData(data), {
      title: options.title,
      subtitle: options.subtitle,
      accent: options.accent ?? DEFAULT_ACCENT,
      secondary: options.secondary ?? DEFAULT_SECONDARY,
      background: options.background ?? DEFAULT_BACKGROUND,
      textColor: options.textColor ?? DEFAULT_TEXT,
    })
  );

  const svg = chart.renderToSVGString();
  chart.dispose();

  return { type, svg: stripUnsafeSvg(svg), width, height, library: 'echarts' };
}

function chartOption(
  type: StaticChartType,
  data: StaticChartDatum[],
  style: {
    title?: string;
    subtitle?: string;
    accent: string;
    secondary: string;
    background: string;
    textColor: string;
  }
): echarts.EChartsOption {
  const labels = data.map((item) => item.label);
  const values = data.map((item) => item.value);
  const palette = [style.accent, style.secondary, '#B7791F', '#6D28D9', '#C2410C'];
  const common: echarts.EChartsOption = {
    backgroundColor: style.background,
    animation: false,
    color: palette,
    title: style.title
      ? {
          text: style.title,
          subtext: style.subtitle,
          left: 24,
          top: 20,
          textStyle: {
            color: style.textColor,
            fontFamily: 'Aptos, Segoe UI, Arial, sans-serif',
            fontSize: 28,
            fontWeight: 700,
          },
          subtextStyle: {
            color: withAlpha(style.textColor, 0.62),
            fontSize: 17,
          },
        }
      : undefined,
  };

  if (type === 'pie' || type === 'doughnut') {
    return {
      ...common,
      tooltip: { show: false },
      legend: {
        orient: 'vertical',
        right: 24,
        top: 'middle',
        textStyle: { color: style.textColor, fontSize: 18 },
      },
      series: [
        {
          type: 'pie',
          radius: type === 'doughnut' ? ['42%', '68%'] : ['0%', '68%'],
          center: ['38%', '56%'],
          avoidLabelOverlap: true,
          label: {
            color: style.textColor,
            fontSize: 18,
            formatter: '{b}\n{d}%',
          },
          itemStyle: { borderColor: '#FFFCF4', borderWidth: 3 },
          data: data.map((item) => ({ name: item.label, value: item.value })),
        },
      ],
    };
  }

  if (type === 'funnel') {
    return {
      ...common,
      series: [
        {
          type: 'funnel',
          left: '12%',
          top: style.title ? 108 : 48,
          width: '76%',
          height: '72%',
          sort: 'descending',
          gap: 8,
          label: { color: style.textColor, fontSize: 19 },
          itemStyle: { borderColor: '#FFFCF4', borderWidth: 2 },
          data: data.map((item) => ({ name: item.label, value: item.value })),
        },
      ],
    };
  }

  const isLine = type === 'line' || type === 'area';
  return {
    ...common,
    grid: {
      left: 72,
      right: 36,
      top: style.title ? 112 : 42,
      bottom: 66,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: withAlpha(style.textColor, 0.22) } },
      axisLabel: {
        color: withAlpha(style.textColor, 0.72),
        fontSize: 16,
        interval: 0,
      },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: withAlpha(style.textColor, 0.1) } },
      axisLabel: { color: withAlpha(style.textColor, 0.58), fontSize: 15 },
    },
    series: [
      {
        type: isLine ? 'line' : 'bar',
        data: values,
        smooth: isLine,
        symbolSize: 9,
        lineStyle: { width: 5, color: style.accent },
        areaStyle:
          type === 'area'
            ? { color: withAlpha(style.accent, 0.16) }
            : undefined,
        itemStyle: {
          color: style.accent,
          borderRadius: type === 'bar' ? [8, 8, 0, 0] : undefined,
        },
        barWidth: type === 'bar' ? '46%' : undefined,
        label:
          type === 'bar'
            ? {
                show: true,
                position: 'top',
                color: style.textColor,
                fontSize: 17,
                fontWeight: 700,
              }
            : undefined,
      },
    ],
  };
}

function normalizeData(data: StaticChartDatum[]): StaticChartDatum[] {
  return data
    .map((item, index) => ({
      label: String(item.label || `Item ${index + 1}`).slice(0, 42),
      value: Number.isFinite(item.value) ? item.value : 0,
    }))
    .slice(0, 12);
}

function normalizeChartType(value: unknown): StaticChartType {
  const raw = String(value ?? 'bar').toLowerCase();
  if (raw === 'donut') return 'doughnut';
  if (raw === 'area') return 'area';
  if (raw === 'line') return 'line';
  if (raw === 'pie') return 'pie';
  if (raw === 'doughnut') return 'doughnut';
  if (raw === 'funnel') return 'funnel';
  return 'bar';
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function withAlpha(color: string, alpha: number): string {
  const hex = /^#?([a-f0-9]{6})$/i.exec(color);
  if (!hex) return color;
  const value = hex[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function stripUnsafeSvg(svg: string): string {
  return svg
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sxmlns(?::xlink)?="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}
