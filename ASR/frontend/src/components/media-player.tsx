'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaPlayerProps {
  audioUrl?: string;
}

export function MediaPlayer({ audioUrl }: MediaPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [volume, setVolume] = useState(1);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current && !isDragging) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, [isDragging]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  }, []);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full">
      {/* Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        src={audioUrl || ''}
      />

      <style jsx>{`
        input[type='range'] {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          width: 100%;
          height: 24px;
          background: transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        /* Seek Bar Thumb */
        input[type='range']::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgb(var(--atelier-terracotta-rgb));
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(var(--atelier-terracotta-rgb), 0.4);
          transition: all 0.2s ease;
          margin-top: -5.5px;
        }

        input[type='range']::-webkit-slider-thumb:hover {
          width: 16px;
          height: 16px;
          box-shadow: 0 4px 12px rgba(var(--atelier-terracotta-rgb), 0.6);
          margin-top: -6px;
        }

        input[type='range']::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgb(var(--atelier-terracotta-rgb));
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(var(--atelier-terracotta-rgb), 0.4);
          transition: all 0.2s ease;
        }

        input[type='range']::-moz-range-thumb:hover {
          width: 16px;
          height: 16px;
          box-shadow: 0 4px 12px rgba(var(--atelier-terracotta-rgb), 0.6);
        }

        /* Seek Bar Track */
        input[type='range']::-webkit-slider-runnable-track {
          width: 100%;
          height: 3px;
          background: linear-gradient(
            to right,
            rgb(var(--atelier-terracotta-rgb)) 0%,
            rgb(var(--atelier-terracotta-rgb)) var(--seek-percent, 0%),
            rgba(var(--atelier-ink-rgb), 0.08) var(--seek-percent, 0%),
            rgba(var(--atelier-ink-rgb), 0.08) 100%
          );
          border-radius: 2px;
        }

        input[type='range']::-moz-range-track {
          background: transparent;
          border: none;
          height: 3px;
        }

        input[type='range']::-moz-range-progress {
          background: rgb(var(--atelier-terracotta-rgb));
          height: 3px;
          border-radius: 2px;
        }

        /* Volume Slider */
        .volume-slider {
          height: 20px;
        }

        /* Volume Slider Thumb */
        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgb(var(--atelier-terracotta-rgb));
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(var(--atelier-terracotta-rgb), 0.3);
          transition: all 0.2s ease;
          margin-top: -4.5px;
        }

        .volume-slider::-webkit-slider-thumb:hover {
          width: 14px;
          height: 14px;
          box-shadow: 0 2px 8px rgba(var(--atelier-terracotta-rgb), 0.5);
          margin-top: -5px;
        }

        .volume-slider::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgb(var(--atelier-terracotta-rgb));
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(var(--atelier-terracotta-rgb), 0.3);
          transition: all 0.2s ease;
        }

        .volume-slider::-moz-range-thumb:hover {
          width: 14px;
          height: 14px;
          box-shadow: 0 2px 8px rgba(var(--atelier-terracotta-rgb), 0.5);
        }

        /* Volume Track */
        .volume-slider::-webkit-slider-runnable-track {
          width: 100%;
          height: 2px;
          background: linear-gradient(
            to right,
            rgb(var(--atelier-terracotta-rgb)) 0%,
            rgb(var(--atelier-terracotta-rgb)) var(--volume-percent, 100%),
            rgba(var(--atelier-ink-rgb), 0.08) var(--volume-percent, 100%),
            rgba(var(--atelier-ink-rgb), 0.08) 100%
          );
          border-radius: 1px;
        }

        .volume-slider::-moz-range-track {
          background: transparent;
          border: none;
          height: 2px;
        }

        .volume-slider::-moz-range-progress {
          background: rgb(var(--atelier-terracotta-rgb));
          height: 2px;
          border-radius: 1px;
        }
      `}</style>

      <div className="flex items-center justify-center gap-5 px-6 py-5">
        {/* Play/Pause Button */}
        <button
          onClick={togglePlay}
          disabled={!audioUrl}
          className={cn(
            'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all',
            'bg-[var(--atelier-terracotta)] shadow-md hover:shadow-lg hover:scale-105 active:scale-95',
            !audioUrl && 'opacity-30 cursor-not-allowed hover:scale-100'
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={20} className="text-white fill-white" />
          ) : (
            <Play size={20} className="text-white fill-white ml-0.5" />
          )}
        </button>

        {/* Time Display */}
        <div className="text-xs font-light tracking-wide text-[rgba(var(--atelier-ink-rgb),0.45)] min-w-[40px]">
          {formatTime(currentTime)}
        </div>

        {/* Seek Bar */}
        <div className="flex-1">
          <input
            type="range"
            min="0"
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onTouchStart={() => setIsDragging(true)}
            onTouchEnd={() => setIsDragging(false)}
            disabled={!audioUrl}
            className={cn(!audioUrl && 'opacity-30 cursor-not-allowed')}
            style={
              {
                '--seek-percent': `${duration ? (currentTime / duration) * 100 : 0}%`,
              } as React.CSSProperties
            }
          />
        </div>

        {/* Total Time */}
        <div className="text-xs font-light tracking-wide text-[rgba(var(--atelier-ink-rgb),0.45)] min-w-[40px] text-right">
          {formatTime(duration)}
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2 pl-3 border-l border-[rgba(var(--atelier-ink-rgb),0.05)]">
          <Volume2 size={16} className="text-[rgba(var(--atelier-ink-rgb),0.35)] flex-shrink-0" />
          <div className="w-20">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolumeChange}
              disabled={!audioUrl}
              className={cn('volume-slider', !audioUrl && 'opacity-30 cursor-not-allowed')}
              style={
                {
                  '--volume-percent': `${volume * 100}%`,
                } as React.CSSProperties
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
