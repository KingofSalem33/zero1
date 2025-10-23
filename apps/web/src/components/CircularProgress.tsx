import React from "react";

interface CircularProgressProps {
  value: number; // 0-100
  size?: "sm" | "md" | "lg";
  className?: string;
}

const CircularProgress: React.FC<CircularProgressProps> = ({
  value,
  size = "md",
  className = "",
}) => {
  const sizeClasses = {
    sm: "w-12 h-12",
    md: "w-20 h-20",
    lg: "w-32 h-32",
  };

  const textSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-xl",
  };

  const strokeWidths = {
    sm: 4,
    md: 6,
    lg: 8,
  };

  const sizeValue = {
    sm: 48,
    md: 80,
    lg: 128,
  };

  const radius = (sizeValue[size] - strokeWidths[size]) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <svg className="w-full h-full -rotate-90">
        {/* Background circle */}
        <circle
          cx={sizeValue[size] / 2}
          cy={sizeValue[size] / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
          fill="none"
          className="text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={sizeValue[size] / 2}
          cy={sizeValue[size] / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidths[size]}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-blue-500 transition-all duration-500"
        />
      </svg>
      {/* Centered percentage text */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-bold text-white ${textSizes[size]}`}>
          {Math.round(value)}%
        </span>
      </div>
    </div>
  );
};

export default CircularProgress;
