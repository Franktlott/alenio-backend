import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
  active?: boolean;
};

export function ConnectionsIcon({
  size = 22,
  color = "#8A95A7",
  active = false,
}: Props) {
  const leftFill = active ? "url(#connectionsBlue)" : color;
  const rightFill = active ? "url(#connectionsPurple)" : color;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Defs>
        <LinearGradient
          id="connectionsBlue"
          x1="2"
          y1="3"
          x2="12"
          y2="19"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#2563EB" />
          <Stop offset="1" stopColor="#6366F1" />
        </LinearGradient>
        <LinearGradient
          id="connectionsPurple"
          x1="11"
          y1="4"
          x2="21"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <Stop stopColor="#6366F1" />
          <Stop offset="1" stopColor="#8B5CF6" />
        </LinearGradient>
      </Defs>

      <Circle cx="8" cy="7" r="3.25" fill={leftFill} />
      <Path
        d="M2.6 18.1c0-4 2.2-6.35 5.4-6.35s5.4 2.35 5.4 6.35c0 .75-.6 1.35-1.35 1.35h-8.1c-.75 0-1.35-.6-1.35-1.35Z"
        fill={leftFill}
      />
      <Circle
        cx="15.65"
        cy="7.75"
        r="3.45"
        fill={rightFill}
        stroke="#FFFFFF"
        strokeWidth="0.8"
      />
      <Path
        d="M9.7 18.4c0-4.2 2.45-6.7 5.95-6.7s5.95 2.5 5.95 6.7c0 .8-.65 1.45-1.45 1.45h-9c-.8 0-1.45-.65-1.45-1.45Z"
        fill={rightFill}
        stroke="#FFFFFF"
        strokeWidth="0.8"
      />
    </Svg>
  );
}
