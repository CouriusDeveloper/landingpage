// =============================================================================
// STATIC TEMPLATES - These don't need AI generation, just variable replacement
// =============================================================================

export const STATIC_TEMPLATES = {
  // ThemeProvider - always the same
  'src/components/layout/ThemeProvider.tsx': `'use client'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('system')
  
  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    if (stored) setTheme(stored)
  }, [])
  
  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && systemDark)
    root.classList.toggle('dark', isDark)
    if (theme !== 'system') localStorage.setItem('theme', theme)
  }, [theme])
  
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)!
export default ThemeProvider
`,

  // ThemeToggle - always the same
  'src/components/layout/ThemeToggle.tsx': `'use client'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from './ThemeProvider'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = { light: 'dark', dark: 'system', system: 'light' } as const
  const icons = { light: Sun, dark: Moon, system: Monitor }
  const Icon = icons[theme]
  return (
    <button onClick={() => setTheme(next[theme])} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label="Theme wechseln">
      <Icon className="w-5 h-5" />
    </button>
  )
}
export default ThemeToggle
export { ThemeToggle }
`,

  // Motion components - always the same
  'src/components/ui/Motion.tsx': `'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

export function FadeIn({ children, delay = 0, duration = 0.5, className = '' }: { children: ReactNode; delay?: number; duration?: number; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ duration, delay, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  )
}

export function SlideIn({ children, direction = 'left', delay = 0, className = '' }: { children: ReactNode; direction?: 'left' | 'right' | 'up' | 'down'; delay?: number; className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const variants: Record<string, { x?: number; y?: number }> = {
    left: { x: -50 }, right: { x: 50 }, up: { y: -50 }, down: { y: 50 }
  }
  const initial = { opacity: 0, ...variants[direction] }
  return (
    <motion.div ref={ref} initial={initial} animate={isInView ? { opacity: 1, x: 0, y: 0 } : initial} transition={{ duration: 0.6, delay, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  )
}

export function StaggerContainer({ children, className = '', staggerDelay = 0.1 }: { children: ReactNode; className?: string; staggerDelay?: number }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }} variants={{ visible: { transition: { staggerChildren: staggerDelay } } }} className={className}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } } }} className={className}>
      {children}
    </motion.div>
  )
}

export function ScaleOnHover({ children, scale = 1.02, className = '' }: { children: ReactNode; scale?: number; className?: string }) {
  return (
    <motion.div whileHover={{ scale }} whileTap={{ scale: 0.98 }} transition={{ type: 'spring', stiffness: 400, damping: 17 }} className={className}>
      {children}
    </motion.div>
  )
}
`,

  // ScrollProgress - always the same
  'src/components/ui/ScrollProgress.tsx': `'use client'
import { motion, useScroll, useSpring } from 'framer-motion'

export function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 })
  return <motion.div className="fixed top-0 left-0 right-0 h-1 bg-primary origin-left z-50" style={{ scaleX }} />
}
`,

  // BackToTop - always the same
  'src/components/ui/BackToTop.tsx': `'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUp } from 'lucide-react'

export function BackToTop() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 400)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-8 right-8 p-3 rounded-full bg-primary text-white shadow-lg hover:opacity-90 z-40"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
`,

  // tsconfig.json - always the same
  'tsconfig.json': `{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
`,

  // next.config.js - always the same
  'next.config.js': `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sanity.io' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
}
`,

  // postcss.config.js - always the same
  'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
}

// Dynamic template with variable replacement
export function generatePackageJson(projectName: string, addons: {
  cms?: boolean
  email?: boolean
  analytics?: boolean
}): string {
  const deps: Record<string, string> = {
    "next": "^14.2.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.300.0"
  }
  
  if (addons.cms) {
    deps["@sanity/client"] = "^6.0.0"
    deps["@sanity/image-url"] = "^1.0.0"
  }
  
  if (addons.email) {
    deps["resend"] = "^2.0.0"
  }

  return JSON.stringify({
    name: projectName.toLowerCase().replace(/\s+/g, '-'),
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start"
    },
    dependencies: deps,
    devDependencies: {
      "typescript": "^5.0.0",
      "@types/react": "^18.2.0",
      "@types/react-dom": "^18.2.0",
      "@types/node": "^20.0.0",
      "tailwindcss": "^3.4.0",
      "autoprefixer": "^10.0.0",
      "postcss": "^8.0.0"
    }
  }, null, 2)
}

export function generateTailwindConfig(primaryColor: string, secondaryColor: string): string {
  return `import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '${primaryColor}',
        secondary: '${secondaryColor}',
      },
    },
  },
  plugins: [],
} satisfies Config
`
}

export function generateGlobalsCss(primaryColor: string, secondaryColor: string): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: ${primaryColor};
  --color-secondary: ${secondaryColor};
}

.dark {
  --color-background: #0f172a;
  --color-text: #f1f5f9;
}

@layer base {
  html { scroll-behavior: smooth; }
  body {
    @apply antialiased bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300;
  }
  h1, h2, h3, h4, h5, h6 {
    @apply text-slate-900 dark:text-white font-semibold tracking-tight;
  }
}

@layer components {
  .section { @apply py-16 md:py-24; }
  .container-custom { @apply max-w-7xl mx-auto px-4 sm:px-6 lg:px-8; }
  .card {
    @apply bg-white dark:bg-slate-800 rounded-xl shadow-lg dark:shadow-slate-900/50 p-6 md:p-8;
    @apply border border-slate-100 dark:border-slate-700;
  }
  .btn-primary {
    @apply px-6 py-3 bg-primary text-white rounded-lg font-medium;
    @apply hover:opacity-90 transition-all duration-300;
  }
}
`
}

export function generateLayoutTsx(siteName: string, siteDescription: string): string {
  return `import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { ScrollProgress } from '@/components/ui/ScrollProgress'
import { BackToTop } from '@/components/ui/BackToTop'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: '${siteName}',
  description: '${siteDescription}',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <ScrollProgress />
          {children}
          <BackToTop />
        </ThemeProvider>
      </body>
    </html>
  )
}
`
}
