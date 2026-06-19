"use client";

import { motion, type Variants } from "framer-motion";
import * as React from "react";

import { cn } from "@/lib/utils";

const variants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      delay: i * 0.08,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Stagger index — multiplies the entrance delay. */
  index?: number;
  as?: "div" | "li" | "section";
}

/** Fades + lifts its children into view once when scrolled near. */
export function Reveal({
  children,
  className,
  index = 0,
  as = "div",
  ...props
}: RevealProps) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={cn(className)}
      custom={index}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      {...(props as object)}
    >
      {children}
    </MotionTag>
  );
}
