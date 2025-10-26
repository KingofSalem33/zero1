/**
 * Design System Showcase Component
 *
 * This component demonstrates all design tokens in the system.
 * Use this as a reference for colors, typography, spacing, and patterns.
 *
 * To view: Import and render this component in your app during development.
 */

import React from "react";

const DesignSystemShowcase: React.FC = () => {
  return (
    <div className="min-h-screen bg-neutral-900 p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-brand-primary-400 to-brand-secondary-400 bg-clip-text text-transparent">
            Zero-to-One Design System
          </h1>
          <p className="text-neutral-400">
            A comprehensive design token system for consistent, beautiful UIs
          </p>
        </div>

        {/* Colors */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Colors</h2>

          {/* Brand Colors */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Brand Colors
            </h3>
            <div className="grid grid-cols-5 gap-4">
              {[400, 500, 600].map((shade) => (
                <div key={shade} className="space-y-2">
                  <div
                    className={`h-20 rounded-lg bg-brand-primary-${shade}`}
                  />
                  <p className="text-xs text-neutral-400">Primary {shade}</p>
                </div>
              ))}
              {[400, 500, 600].map((shade) => (
                <div key={shade} className="space-y-2">
                  <div
                    className={`h-20 rounded-lg bg-brand-secondary-${shade}`}
                  />
                  <p className="text-xs text-neutral-400">Secondary {shade}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Neutral Colors */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Neutral Colors
            </h3>
            <div className="grid grid-cols-6 gap-4">
              {[300, 400, 500, 600, 700, 800, 900].map((shade) => (
                <div key={shade} className="space-y-2">
                  <div
                    className={`h-20 rounded-lg bg-neutral-${shade} border border-neutral-600`}
                  />
                  <p className="text-xs text-neutral-400">Neutral {shade}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Semantic Colors */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Semantic Colors
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-success-500" />
                <p className="text-xs text-neutral-400">Success</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-warning-500" />
                <p className="text-xs text-neutral-400">Warning</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-error-500" />
                <p className="text-xs text-neutral-400">Error</p>
              </div>
            </div>
          </div>
        </section>

        {/* Typography */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Typography</h2>

          <div className="space-y-4 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
            <div className="space-y-2">
              <h1 className="font-bold">Heading 1 - Bold</h1>
              <h2 className="font-semibold">Heading 2 - Semibold</h2>
              <h3 className="font-semibold">Heading 3 - Semibold</h3>
              <h4 className="font-semibold">Heading 4 - Semibold</h4>
              <h5 className="font-semibold">Heading 5 - Semibold</h5>
              <h6 className="font-semibold">Heading 6 - Semibold</h6>
              <p className="text-base">Body text - Regular weight</p>
              <p className="text-sm text-neutral-400">
                Small text - Neutral 400
              </p>
              <p className="text-xs text-neutral-500">
                Extra small text - Neutral 500
              </p>
              <code className="font-mono">
                Code snippet with monospace font
              </code>
            </div>
          </div>
        </section>

        {/* Spacing */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Spacing</h2>
          <div className="space-y-4 bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
            {[2, 4, 6, 8, 12].map((space) => (
              <div key={space} className="flex items-center gap-4">
                <div
                  className={`h-8 bg-brand-primary-500 rounded`}
                  style={{ width: `${space * 4}px` }}
                />
                <p className="text-sm text-neutral-400">
                  {space * 4}px (p-{space})
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Border Radius */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Border Radius</h2>
          <div className="grid grid-cols-4 gap-4">
            {[
              { name: "lg", label: "12px" },
              { name: "xl", label: "16px" },
              { name: "2xl", label: "24px" },
              { name: "full", label: "Full" },
            ].map(({ name, label }) => (
              <div key={name} className="space-y-2">
                <div className={`h-20 bg-brand-primary-500 rounded-${name}`} />
                <p className="text-xs text-neutral-400">
                  {name} ({label})
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Gradients */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">
            Standardized Gradients
          </h2>
          <p className="text-sm text-neutral-400">
            Limited, intentional gradient palette for consistency
          </p>

          {/* Brand Gradients */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Brand Gradients (Blue → Purple)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-brand" />
                <p className="text-xs text-neutral-400">bg-gradient-brand</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-brand-hover" />
                <p className="text-xs text-neutral-400">
                  bg-gradient-brand-hover
                </p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-brand-subtle border border-brand-primary-500/50" />
                <p className="text-xs text-neutral-400">
                  bg-gradient-brand-subtle
                </p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-brand-muted border border-brand-primary-500/30" />
                <p className="text-xs text-neutral-400">
                  bg-gradient-brand-muted
                </p>
              </div>
            </div>
          </div>

          {/* Semantic Gradients */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Semantic Gradients
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-success" />
                <p className="text-xs text-neutral-400">bg-gradient-success</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-warning" />
                <p className="text-xs text-neutral-400">bg-gradient-warning</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-error" />
                <p className="text-xs text-neutral-400">bg-gradient-error</p>
              </div>
            </div>
          </div>

          {/* Surface Gradients */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-neutral-300">
              Surface Gradients
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-surface border border-neutral-700" />
                <p className="text-xs text-neutral-400">bg-gradient-surface</p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-surface-elevated border border-neutral-700" />
                <p className="text-xs text-neutral-400">
                  bg-gradient-surface-elevated
                </p>
              </div>
              <div className="space-y-2">
                <div className="h-20 rounded-lg bg-gradient-surface-subtle border border-neutral-700" />
                <p className="text-xs text-neutral-400">
                  bg-gradient-surface-subtle
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <button className="px-6 py-3 rounded-xl bg-gradient-brand hover:bg-gradient-brand-hover text-white font-medium transition-all shadow-lg hover:shadow-xl">
              Primary Button
            </button>
            <button className="px-4 py-2 rounded-lg bg-neutral-700/30 border border-neutral-600/50 text-neutral-300 hover:bg-neutral-700/50 hover:border-neutral-500/70 transition-all">
              Secondary Button
            </button>
            <button className="px-4 py-2 rounded-lg bg-gradient-success hover:bg-gradient-success-hover text-white font-medium transition-all">
              Success Button
            </button>
            <button className="px-4 py-2 rounded-lg bg-gradient-error hover:bg-gradient-error-hover text-white font-medium transition-all">
              Error Button
            </button>
            <button className="px-4 py-2 rounded-lg border-2 border-brand-primary-500 text-brand-primary-500 hover:bg-brand-primary-500/10 font-medium transition-all">
              Outline Button
            </button>
          </div>
        </section>

        {/* Cards */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Standard Card
              </h3>
              <p className="text-neutral-400">
                A basic card with neutral colors and subtle border.
              </p>
            </div>
            <div className="bg-gradient-brand-subtle border border-brand-primary-500/50 rounded-xl shadow-lg shadow-glow p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Elevated Card
              </h3>
              <p className="text-neutral-300">
                A card with brand gradient background and glow effect.
              </p>
            </div>
            <div className="bg-gradient-success-subtle border border-success-500/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-success-400 mb-2">
                Success Card
              </h3>
              <p className="text-neutral-300">
                Used for success messages and confirmations.
              </p>
            </div>
            <div className="bg-gradient-error-subtle border border-error-500/50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-error-400 mb-2">
                Error Card
              </h3>
              <p className="text-neutral-300">
                Used for error messages and warnings.
              </p>
            </div>
          </div>
        </section>

        {/* Inputs */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Form Inputs</h2>
          <div className="space-y-4 max-w-2xl">
            <input
              type="text"
              placeholder="Text input..."
              className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50"
            />
            <textarea
              placeholder="Textarea..."
              rows={4}
              className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50 resize-none"
            />
            <select className="w-full bg-neutral-900/50 border border-neutral-600/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-brand-primary-500/50">
              <option>Option 1</option>
              <option>Option 2</option>
              <option>Option 3</option>
            </select>
          </div>
        </section>

        {/* Shadows */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-white">Shadows</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-neutral-800 rounded-xl p-6 shadow-soft-md">
              <p className="text-sm text-neutral-300">Soft Medium</p>
            </div>
            <div className="bg-neutral-800 rounded-xl p-6 shadow-soft-lg">
              <p className="text-sm text-neutral-300">Soft Large</p>
            </div>
            <div className="bg-neutral-800 rounded-xl p-6 shadow-glow">
              <p className="text-sm text-neutral-300">Blue Glow</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DesignSystemShowcase;
