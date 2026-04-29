"use client"

import * as React from "react"
import { AnimatePresence, motion } from "motion/react"
import { createPortal } from "react-dom"

// MorphingDialog — card expands into a dialog with spring animation

function MorphingDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <MorphingDialogContext.Provider value={{ open, setOpen }}>
      {children}
    </MorphingDialogContext.Provider>
  )
}

const MorphingDialogContext = React.createContext<{
  open: boolean
  setOpen: (v: boolean) => void
}>({ open: false, setOpen: () => {} })

function MorphingDialogTrigger({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { setOpen } = React.useContext(MorphingDialogContext)
  return (
    <div className={className} onClick={() => setOpen(true)}>
      {children}
    </div>
  )
}

function MorphingDialogContainer({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = React.useContext(MorphingDialogContext)
  return (
    <>
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.div
                  key="backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-50 bg-black/50"
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  key="dialog"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setOpen(false)
                  }}
                >
                  {children}
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  )
}

function MorphingDialogContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

export {
  MorphingDialog,
  MorphingDialogTrigger,
  MorphingDialogContainer,
  MorphingDialogContent,
}
