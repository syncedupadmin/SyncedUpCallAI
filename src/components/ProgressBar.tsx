'use client';

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  showPercentage?: boolean;
  color?: string;
  height?: number;
  animated?: boolean;
}

export default function ProgressBar({
  value,
  max,
  label,
  showPercentage = true,
  color = '#00d4ff',
  height = 8,
  animated = true
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
  
  return (
    <div style={{ width: '100%' }}>
      {(label || showPercentage) && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: 8,
          fontSize: 12,
          color: '#6b6b7c'
        }}>
          {label && <span>{label}</span>}
          {showPercentage && <span>{percentage}%</span>}
        </div>
      )}
      
      <div style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'rgba(20, 20, 30, 0.6)',
        borderRadius: height / 2,
        overflow: 'hidden',
        border: '1px solid rgba(0, 212, 255, 0.2)'
      }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            borderRadius: height / 2,
            transition: animated ? 'width 0.3s ease' : 'none',
            boxShadow: `0 0 10px ${color}66`
          }}
        />
        
        {animated && percentage > 0 && percentage < 100 && (
          <div
            className="pulse"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 4,
              height: '100%',
              background: color,
              transform: `translateX(-${100 - percentage}%)`,
              opacity: 0.8
            }}
          />
        )}
      </div>
      
      {value > 0 && max > 0 && (
        <div style={{
          marginTop: 6,
          fontSize: 11,
          color: '#6b6b7c',
          textAlign: 'center'
        }}>
          {value} / {max} completed
        </div>
      )}
    </div>
  );
}