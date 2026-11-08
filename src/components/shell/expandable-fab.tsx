"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Clock,
  FileText,
  ListTodo,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import { CaptureTabMode } from "@/components/shell/orbit-shell";

interface ExpandableFabProps {
  onOpenCapture: (mode: CaptureTabMode) => void;
  onOpenVoice: () => void;
}

export function ExpandableFab({
  onOpenCapture,
  onOpenVoice,
}: ExpandableFabProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close FAB on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const items = [
    {
      id: "voice",
      label: "Quick Talk (AI)",
      icon: Mic,
      colorClass: "bg-primary text-primary-content hover:bg-primary/90",
      highlight: true,
      onClick: () => {
        setIsOpen(false);
        onOpenVoice();
      },
    },
    {
      id: "task",
      label: "Task",
      icon: ListTodo,
      colorClass: "bg-base-100 text-base-content hover:bg-base-200 border border-base-300/80 shadow-md",
      highlight: false,
      onClick: () => {
        setIsOpen(false);
        onOpenCapture("task");
      },
    },
    {
      id: "note",
      label: "Note",
      icon: FileText,
      colorClass: "bg-base-100 text-base-content hover:bg-base-200 border border-base-300/80 shadow-md",
      highlight: false,
      onClick: () => {
        setIsOpen(false);
        onOpenCapture("note");
      },
    },
    {
      id: "log",
      label: "Log work",
      icon: Clock,
      colorClass: "bg-base-100 text-base-content hover:bg-base-200 border border-base-300/80 shadow-md",
      highlight: false,
      onClick: () => {
        setIsOpen(false);
        onOpenCapture("log");
      },
    },
  ];

  return (
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex flex-col items-end">
      {/* Backdrop overlay when open */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-neutral/20 backdrop-blur-[2px] z-30"
          />
        )}
      </AnimatePresence>

      {/* Speed Dial Items Container */}
      <AnimatePresence>
        {isOpen && (
          <div className="relative z-40 mb-3 flex flex-col items-end gap-2.5">
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 15, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.85 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 24,
                    delay: (items.length - 1 - index) * 0.04,
                  }}
                  className="flex items-center gap-2.5 group"
                >
                  {/* Label pill on the left */}
                  <span
                    onClick={item.onClick}
                    className="cursor-pointer select-none rounded-xl bg-base-100/95 px-3 py-1.5 text-xs font-semibold text-base-content shadow-md border border-base-300/70 backdrop-blur transition-all group-hover:scale-105 flex items-center gap-1.5"
                  >
                    {item.highlight && (
                      <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                    )}
                    <span>{item.label}</span>
                  </span>

                  {/* Circular action button */}
                  <button
                    type="button"
                    onClick={item.onClick}
                    aria-label={item.label}
                    className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform active:scale-90 ${item.colorClass}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </button>
                </motion.div>
              );
            })}
          </div>
        )}
      </AnimatePresence>

      {/* Main Primary FAB button */}
      <motion.button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close capture menu" : "Open capture menu"}
        whileTap={{ scale: 0.92 }}
        className="relative z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-content shadow-xl hover:shadow-2xl transition-all"
      >
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
          className="flex items-center justify-center"
        >
          <Plus className="h-6 w-6 stroke-[2.4]" aria-hidden="true" />
        </motion.div>
      </motion.button>
    </div>
  );
}
