"use client";

import React from "react";
import { motion } from "motion/react";

export function LiquidGlass({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative group ${className}`}>
      {/* Animated blob background */}
      <div className="absolute -inset-1 z-0 overflow-hidden rounded-[2rem]">
        <motion.div
          animate={{
            rotate: [0, 360],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] rounded-full bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(16,185,129,0.3)_360deg)] opacity-50 mix-blend-plus-lighter"
        />
        <motion.div
          animate={{
            rotate: [360, 0],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] rounded-full bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(6,182,212,0.3)_360deg)] opacity-50 mix-blend-plus-lighter"
        />
      </div>

      {/* Glass Pane */}
      <div className="relative z-10 w-full h-full p-8 backdrop-blur-2xl bg-zinc-950/40 border border-white/10 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] transition-all duration-500 ease-in-out group-hover:bg-zinc-950/50">
        {/* Gloss overlay */}
        <div className="absolute inset-0 rounded-[inherit] bg-gradient-to-tr from-white/[0.05] via-transparent to-transparent pointer-events-none" />
        {children}
      </div>
    </div>
  );
}
