"use client";

import { motion, useInView } from "motion/react";
import * as React from "react";

export function AnimatedText({
  text,
  className = "",
  once = true,
}: {
  text: string;
  className?: string;
  once?: boolean;
}) {
  const ref = React.useRef(null);
  const isInView = useInView(ref, { once });

  return (
    <div className={`flex flex-wrap ${className}`} ref={ref}>
      {text.split(" ").map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
          animate={
            isInView
              ? { opacity: 1, y: 0, filter: "blur(0px)" }
              : { opacity: 0, y: 20, filter: "blur(10px)" }
          }
          transition={{
            duration: 0.8,
            delay: i * 0.1,
            ease: [0.2, 0.65, 0.3, 0.9],
          }}
          className="mr-[0.3em] inline-block font-bold"
        >
          {word === "Aethon." ? (
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-emerald-300 animate-pulse">
              {word}
            </span>
          ) : (
            word
          )}
        </motion.span>
      ))}
    </div>
  );
}
