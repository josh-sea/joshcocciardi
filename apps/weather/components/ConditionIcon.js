import React from 'react';
import Svg, { Circle, Line, Path, G } from 'react-native-svg';

// Simple line icons for Pirate Weather's `icon` values (clear-day, rain,
// partly-cloudy-night, ...). Drawn on a 48x48 grid.

const CLOUD = 'M14 34 H36 A8 8 0 0 0 36 18 A11 11 0 0 0 15 17 A8.6 8.6 0 0 0 14 34 Z';

const Sun = ({ cx = 24, cy = 24, r = 7, ray = 5, color }) => (
  <G>
    <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={2.2} fill="none" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180;
      const r1 = r + 3.5;
      const r2 = r + 3.5 + ray;
      return (
        <Line
          key={deg}
          x1={cx + r1 * Math.cos(a)}
          y1={cy + r1 * Math.sin(a)}
          x2={cx + r2 * Math.cos(a)}
          y2={cy + r2 * Math.sin(a)}
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
      );
    })}
  </G>
);

const Moon = ({ color, transform }) => (
  <Path d="M29 9 A15 15 0 1 0 39 31 A12 12 0 1 1 29 9 Z" stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" transform={transform} />
);

const Cloud = ({ color, fill = 'none', transform }) => (
  <Path d={CLOUD} stroke={color} strokeWidth={2.2} fill={fill} strokeLinejoin="round" transform={transform} />
);

// Short marks under a raised cloud: slanted lines for rain, dots for snow.
const Drops = ({ color, kind }) => {
  const xs = [17, 24, 31];
  if (kind === 'snow') {
    return <G>{xs.map((x, i) => <Circle key={x} cx={x - 1} cy={i % 2 ? 41 : 38} r={1.8} fill={color} />)}</G>;
  }
  if (kind === 'sleet') {
    return (
      <G>
        <Line x1={18} y1={35} x2={16} y2={41} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        <Circle cx={23} cy={40} r={1.8} fill={color} />
        <Line x1={32} y1={35} x2={30} y2={41} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      </G>
    );
  }
  return <G>{xs.map((x) => <Line key={x} x1={x} y1={35} x2={x - 2.5} y2={42} stroke={color} strokeWidth={2.2} strokeLinecap="round" />)}</G>;
};

const ConditionIcon = ({ icon, size = 32, color = '#333', background = '#fff' }) => {
  const raised = 'translate(0 -5)';
  let body;
  switch (icon) {
    case 'clear-day':
      body = <Sun color={color} />;
      break;
    case 'clear-night':
      body = <Moon color={color} />;
      break;
    case 'partly-cloudy-day':
      body = (
        <G>
          <Sun cx={17} cy={16} r={5} ray={3.5} color={color} />
          <Cloud color={color} fill={background} transform="translate(5 5) scale(0.88)" />
        </G>
      );
      break;
    case 'partly-cloudy-night':
      body = (
        <G>
          <Moon color={color} transform="translate(-4 -3) scale(0.7)" />
          <Cloud color={color} fill={background} transform="translate(5 5) scale(0.88)" />
        </G>
      );
      break;
    case 'rain':
    case 'snow':
    case 'sleet':
      body = (
        <G>
          <Cloud color={color} transform={raised} />
          <Drops color={color} kind={icon} />
        </G>
      );
      break;
    case 'fog':
      body = (
        <G>
          <Cloud color={color} transform={raised} />
          <Line x1={12} y1={36} x2={36} y2={36} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <Line x1={16} y1={41} x2={32} y2={41} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </G>
      );
      break;
    case 'wind':
      body = (
        <G>
          <Path d="M8 19 H29 A5 5 0 1 0 24 14" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Path d="M8 27 H36 A5 5 0 1 1 31 32" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
          <Path d="M12 35 H22" stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </G>
      );
      break;
    case 'cloudy':
    default:
      body = <Cloud color={color} />;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {body}
    </Svg>
  );
};

export default ConditionIcon;
