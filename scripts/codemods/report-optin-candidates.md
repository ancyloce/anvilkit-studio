# Inline-style → Tailwind codemod report

- Mode: **DRY-RUN (no files written)**
- Globs: `packages/core/src/**/*.tsx`, `packages/ui/src/**/*.tsx`, `packages/cli/src/**/*.tsx`
- Files scanned: 334
- Style props converted: **21** | skipped (preserved): **104**
- Files modified: 9

## `packages/ui/src/ai-prompt-panel.tsx`

**Converted (3):**

- L183: `style={{ display: "inline-block" }}` → `className="inline-block"`

- L227: `style={{ display: "inline-block" }}` → `className="inline-block"`

- L248: `style={{ overflow: "hidden" }}` → `className="overflow-hidden"`

## `packages/ui/src/animated-shiny-text.tsx`

**Preserved (1):**
- L21: style value is not an object literal — `style={
        {
          "--shiny-width": `${shimmerWidth}px`,
        } as CSSProperties
      }`

## `packages/ui/src/aspect-ratio.tsx`

**Preserved (1):**
- L11: style value is not an object literal — `style={
        {
          "--ratio": ratio,
        } as React.CSSProperties
      }`

## `packages/ui/src/aurora-text.tsx`

**Preserved (1):**
- L31: style value is not an object literal — `style={gradientStyle}`

## `packages/ui/src/flickering-grid.tsx`

**Preserved (1):**
- L300: non-literal value for "width" — `style={{
          width: canvasSize.width,
          height: canvasSize.height,
        }}`

## `packages/ui/src/light-rays.tsx`

**Preserved (4):**
- L63: style value is not an object literal — `style={
        {
          "--ray-left": `${left}%`,
          "--ray-width": `${width}px`,
        } as CSSProperties
      }`
- L110: style value is not an object literal — `style={
        {
          "--light-rays-color": color,
          "--light-rays-blur": `${blur}px`,
          "--light-rays-length": length,
          ...style,
        } as CSSProperties
      }`
- L124: style value is not an object literal — `style={
            {
              background:
                "radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--light-rays-color) 45%, transparent), transparent 70%)",
            } as CSSProperties
          }`
- L134: style value is not an object literal — `style={
            {
              background:
                "radial-gradient(circle at 80% 10%, color-mix(in srgb, var(--light-rays-color) 35%, transparent), transparent 75%)",
            } as CSSProperties
          }`

## `packages/ui/src/progress.tsx`

**Preserved (1):**
- L53: style value is not an object literal — `style={isIndeterminate ? undefined : { width: `${percent}%` }}`

## `packages/ui/src/ripple.tsx`

**Preserved (1):**
- L49: style value is not an object literal — `style={
              {
                "--i": circle.order,
                width: `${circle.size}px`,
                height: `${circle.size}px`,
                opacity: circle.opacity,
                animationDelay: circle.animationDelay,
                borderStyle,
                borderWidth: "1px",
                borderColor: `var(--foreground)`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
              } as CSSProperties
            }`

## `packages/ui/src/safari.tsx`

**Preserved (4):**
- L40: non-literal value for "aspectRatio" — `style={{
        aspectRatio: `${SAFARI_WIDTH}/${SAFARI_HEIGHT}`,
        ...style,
      }}`
- L49: non-literal value for "left" — `style={{
            left: `${LEFT_PCT}%`,
            top: `${TOP_PCT}%`,
            width: `${WIDTH_PCT}%`,
            height: `${HEIGHT_PCT}%`,
          }}`
- L72: non-literal value for "left" — `style={{
            left: `${LEFT_PCT}%`,
            top: `${TOP_PCT}%`,
            width: `${WIDTH_PCT}%`,
            height: `${HEIGHT_PCT}%`,
            borderRadius: "0 0 11px 11px",
          }}`
- L93: unmappable property/value "transform: translateZ(0)" — `style={{ transform: "translateZ(0)" }}`

## `packages/ui/src/shimmer-button.tsx`

**Preserved (1):**
- L31: style value is not an object literal — `style={
				{
					"--spread": "90deg",
					"--shimmer-color": shimmerColor,
					"--radius": borderRadius,
					"--speed": shimmerDuration,
					"--cut": shimmerSize,
					"--bg": background,
				} as CSSProperties
			}`

## `packages/ui/src/windowed.tsx`

**Preserved (7):**
- L104: unmappable property/value "listStyle: none" — `style={{ margin: 0, padding: 0, listStyle: "none" }}`
- L261: shorthand/dynamic property — `style={{ maxHeight, overflowY: "auto" }}`
- L265: non-literal value for "height" — `style={{
						height: virtualizer.getTotalSize(),
						position: "relative",
						width: "100%",
						margin: 0,
						padding: 0,
						listStyle: "none",
					}}`
- L284: non-literal value for "transform" — `style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${row.start}px)`,
								}}`
- L306: shorthand/dynamic property — `style={{ maxHeight, overflowY: "auto" }}`
- L309: non-literal value for "height" — `style={{
					height: virtualizer.getTotalSize(),
					position: "relative",
					width: "100%",
				}}`
- L321: style value is not an object literal — `style={getVirtualGridRowStyle(row.start, effectiveLanes)}`

## `packages/ui/src/presence/presence-cursor.tsx`

**Preserved (3):**
- L36: non-literal value for "transform" — `style={{
        transform: `translate(${cursor.x}px, ${cursor.y}px)`,
      }}`
- L46: shorthand/dynamic property — `style={{ color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))" }}`
- L60: non-literal value for "backgroundColor" — `style={{ backgroundColor: color }}`

## `packages/ui/src/presence/presence-selection-ring.tsx`

**Preserved (1):**
- L43: non-literal value for "transform" — `style={{
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: rect.width,
        height: rect.height,
        borderColor: color,
        boxShadow: `0 0 0 2px ${color}33`,
      }}`

## `packages/core/src/studio/layout/StudioLoadingScreen.tsx`

**Preserved (1):**
- L51: unmappable property/value "inlineSize: var(--ak-studio-rail-width)" — `style={{ inlineSize: "var(--ak-studio-rail-width)" }}`

## `packages/core/src/studio/layout/StudioViewportPreview.tsx`

**Preserved (1):**
- L44: shorthand/dynamic property — `style={{
					width,
					transform: `scale(${zoom})`,
					transformOrigin: "top center",
				}}`

## `packages/core/src/studio/primitives/sonner.tsx`

**Preserved (1):**
- L28: style value is not an object literal — `style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}`

## `packages/core/src/studio/primitives/toggle-group.tsx`

**Preserved (1):**
- L46: style value is not an object literal — `style={{ "--gap": spacing } as React.CSSProperties}`

## `packages/core/src/studio/primitives/windowed.tsx`

**Preserved (3):**
- L128: shorthand/dynamic property — `style={{ maxHeight }}`
- L131: non-literal value for "height" — `style={{
					height: virtualizer.getTotalSize(),
					position: "relative",
					width: "100%",
				}}`
- L142: non-literal value for "transform" — `style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${row.start}px)`,
								display: lanes > 1 ? "grid" : "flex",
								gridTemplateColumns:
									lanes > 1 ? `repeat(${lanes}, minmax(0, 1fr))` : undefined,
								flexDirection: lanes > 1 ? undefined : "column",
								gap: 8,
							}}`

## `packages/cli/src/scaffolds/nextjs/app/layout.tsx`

**Preserved (1):**
- L18: style value is not an object literal — `style={bodyStyle}`

## `packages/cli/src/scaffolds/nextjs/app/page.tsx`

**Converted (2):**

- L44: `style={{ margin: 0, lineHeight: 1.6 }}` → `className="m-0 leading-[1.6]"`

- L49: `style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}` → `className="flex gap-4 flex-wrap"`

**Preserved (6):**
- L30: style value is not an object literal — `style={pageStyle}`
- L31: style value is not an object literal — `style={cardStyle}`
- L33: unmappable property/value "letterSpacing: 0.18em" — `style={{
            margin: 0,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}`
- L41: unmappable property/value "fontSize: clamp(2rem, 8vw, 4rem)" — `style={{ margin: 0, fontSize: "clamp(2rem, 8vw, 4rem)" }}`
- L50: style value is not an object literal — `style={linkStyle}`
- L53: style value is not an object literal — `style={linkStyle}`

## `packages/core/src/studio/layout/sidebar/SidebarPanel.tsx`

**Preserved (1):**
- L67: unmappable property/value "inlineSize: var(--ak-studio-panel-width)" — `style={{ inlineSize: "var(--ak-studio-panel-width)" }}`

## `packages/core/src/studio/layout/sidebar/SidebarRail.tsx`

**Preserved (1):**
- L208: unmappable property/value "inlineSize: var(--ak-studio-rail-width)" — `style={{ inlineSize: "var(--ak-studio-rail-width)" }}`

## `packages/core/src/react/overrides/fields/field-types/ArrayField.tsx`

**Preserved (1):**
- L525: non-literal value for "maxHeight" — `style={{ maxHeight: PROPERTY_PANEL_MAX_HEIGHT }}`

## `packages/ui/src/components/animate-ui/components/base/popover.tsx`

**Preserved (1):**
- L64: style value is not an object literal — `style={style}`

## `packages/ui/src/components/animate-ui/components/base/tooltip.tsx`

**Preserved (1):**
- L65: style value is not an object literal — `style={style}`

## `packages/ui/src/components/animate-ui/primitives/animate/avatar-group.tsx`

**Preserved (2):**
- L46: shorthand/dynamic property — `style={{ position: "relative", zIndex }}`
- L111: contains spread (...style) — `style={{
          display: "flex",
          alignItems: "center",
          ...style,
        }}`

## `packages/ui/src/components/animate-ui/primitives/animate/cursor.tsx`

**Preserved (2):**
- L252: unmappable property/value "transform: translate(-50%,-50%)" — `style={{
            transform: "translate(-50%,-50%)",
            pointerEvents: "none",
            zIndex: 9999,
            position: global ? "fixed" : "absolute",
            top: y,
            left: x,
            ...style,
          }}`
- L402: unmappable property/value "transform: translate(-50%,-50%)" — `style={{
            transform: "translate(-50%,-50%)",
            pointerEvents: "none",
            zIndex: 9998,
            position: global ? "fixed" : "absolute",
            top: springY,
            left: springX,
            ...style,
          }}`

## `packages/ui/src/components/animate-ui/primitives/animate/tooltip.tsx`

**Preserved (3):**
- L231: non-literal value for "rotate" — `style={{ rotate: deg }}`
- L302: non-literal value for "position" — `style={{
              position: strategy,
              top: 0,
              left: 0,
              zIndex: 50,
              transform: `translate3d(${x!}px, ${y!}px, 0)`,
            }}`
- L349: contains spread (...style) — `style={{
                    position: "relative",
                    ...(rendered.data.contentProps?.style || {}),
                  }}`

## `packages/ui/src/components/animate-ui/primitives/base/menu.tsx`

**Preserved (1):**
- L217: style value is not an object literal — `style={style}`

## `packages/ui/src/components/animate-ui/primitives/base/tabs.tsx`

**Preserved (1):**
- L179: contains spread (...style) — `style={{ overflow: "hidden", ...style }}`

## `packages/ui/src/components/animate-ui/primitives/base/toggle-group.tsx`

**Converted (1):**

- L152: `style={{
            position: "relative",
            zIndex: 1,
          }}` → `className="relative z-[1]"`

**Preserved (2):**
- L115: contains spread (...style) — `style={{ inset: 0, ...style }}`
- L142: contains spread (...style) — `style={{ position: "absolute", inset: 0, zIndex: 0, ...style }}`

## `packages/ui/src/components/animate-ui/primitives/base/toggle.tsx`

**Preserved (2):**
- L74: contains spread (...style) — `style={{ position: "absolute", zIndex: 0, inset: 0, ...style }}`
- L96: contains spread (...style) — `style={{ position: "relative", zIndex: 1, ...style }}`

## `packages/ui/src/components/animate-ui/primitives/base/tooltip.tsx`

**Preserved (1):**
- L168: non-literal value for "x" — `style={{
            x:
              followCursor === "x" || followCursor === true
                ? translateX
                : undefined,
            y:
              followCursor === "y" || followCursor === true
                ? translateY
                : undefined,
            ...style,
          }}`

## `packages/ui/src/components/animate-ui/primitives/effects/auto-height.tsx`

**Preserved (1):**
- L45: contains spread (...style) — `style={{ overflow: "hidden", ...style }}`

## `packages/ui/src/components/animate-ui/primitives/effects/highlight.tsx`

**Preserved (5):**
- L272: className is an expression (cn()/template) — not merged — `style={{ position: "relative", zIndex: 1 }}`
- L301: contains spread (...style) — `style={{ position: "absolute", zIndex: 0, ...style }}`
- L568: contains spread (...style) — `style={{
                  position: "absolute",
                  zIndex: 0,
                  ...contextStyle,
                  ...style,
                }}`
- L594: className is an expression (cn()/template) — not merged — `style={{ position: "relative", zIndex: 1 }}`
- L630: contains spread (...style) — `style={{
                position: "absolute",
                zIndex: 0,
                ...contextStyle,
                ...style,
              }}`

## `packages/ui/src/components/animate-ui/primitives/texts/gradient.tsx`

**Preserved (3):**
- L33: contains spread (...style) — `style={{ position: "relative", display: "inline-block", ...style }}`
- L37: style value is not an object literal — `style={baseStyle}`
- L47: unmappable property/value "mixBlendMode: plus-lighter" — `style={{
            position: "absolute",
            top: 0,
            left: 0,
            mixBlendMode: "plus-lighter",
            filter: "blur(8px)",
            ...baseStyle,
          }}`

## `packages/ui/src/components/animate-ui/primitives/texts/highlight.tsx`

**Preserved (1):**
- L46: unmappable property/value "backgroundRepeat: no-repeat" — `style={{
        position: "relative",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "left center",
        display: "inline-block",
        ...style,
      }}`

## `packages/ui/src/components/animate-ui/primitives/texts/morphing.tsx`

**Converted (1):**

- L118: `style={{ display: "inline-block" }}` → `className="inline-block"`

## `packages/ui/src/components/animate-ui/primitives/texts/rolling.tsx`

**Converted (2):**

- L60: `style={{ display: "inline-block", whiteSpace: "nowrap" }}` → `className="inline-block whitespace-nowrap"`

- L105: `style={{ visibility: "hidden" }}` → `className="invisible"`

**Preserved (3):**
- L68: unmappable property/value "perspective: 9999999px" — `style={{
                    position: "relative",
                    display: "inline-block",
                    perspective: "9999999px",
                    transformStyle: "preserve-3d",
                    width: "auto",
                  }}`
- L78: contains spread (...style) — `style={{
                      ...CHAR_STYLE,
                      transformOrigin: "50% 25%",
                    }}`
- L92: contains spread (...style) — `style={{
                      ...CHAR_STYLE,
                      transformOrigin: "50% 100%",
                    }}`

## `packages/ui/src/components/animate-ui/primitives/texts/rotating.tsx`

**Preserved (1):**
- L77: contains spread (...style) — `style={{
          overflow: "hidden",
          paddingBlock: "0.25rem",
          ...style,
        }}`

## `packages/ui/src/components/animate-ui/primitives/texts/shimmering.tsx`

**Preserved (2):**
- L37: style value is not an object literal — `style={
        {
          "--shimmering-color": shimmeringColor,
          "--color": color,
          color: "var(--color)",
          position: "relative",
          display: "inline-block",
          perspective: "500px",
        } as React.CSSProperties
      }`
- L52: unmappable property/value "transformStyle: preserve-3d" — `style={{
            display: "inline-block",
            whiteSpace: "pre",
            transformStyle: "preserve-3d",
          }}`

## `packages/ui/src/components/animate-ui/primitives/texts/sliding-number.tsx`

**Converted (4):**

- L62: `style={{ visibility: "hidden" }}` → `className="invisible"`

- L100: `style={{ visibility: "hidden", position: "absolute" }}` → `className="invisible absolute"`

- L307: `style={{
        display: "inline-flex",
        alignItems: "center",
      }}` → `className="inline-flex items-center"`

- L314: `style={{ marginRight: "0.25rem" }}` → `className="mr-1"`

**Preserved (2):**
- L52: unmappable property/value "width: 1ch" — `style={{
        position: "relative",
        display: "inline-block",
        width: "1ch",
        overflowX: "visible",
        overflowY: "clip",
        lineHeight: 1,
        fontVariantNumeric: "tabular-nums",
      }}`
- L109: shorthand/dynamic property — `style={{
        y,
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}`

## `packages/ui/src/components/animate-ui/primitives/texts/splitting.tsx`

**Converted (4):**

- L99: `style={{ display: "inline-block" }}` → `className="inline-block"`

- L124: `style={{ display: "inline-block", whiteSpace: "normal" }}` → `className="inline-block whitespace-normal"`

- L163: `style={{ display: "inline-block", whiteSpace: "nowrap" }}` → `className="inline-block whitespace-nowrap"`

- L173: `style={{ display: "inline-block", whiteSpace: "pre" }}` → `className="inline-block whitespace-pre"`

## `packages/ui/src/components/animate-ui/primitives/texts/typing.tsx`

**Preserved (1):**
- L196: unmappable property/value "transform: translateY(2px)" — `style={{
        display: "inline-block",
        height: "16px",
        transform: "translateY(2px)",
        width: "1px",
        backgroundColor: "currentColor",
        ...style,
      }}`

## `packages/cli/src/scaffolds/nextjs/app/puck/preview/page.tsx`

**Converted (3):**

- L33: `style={{ margin: 0 }}` → `className="m-0"`

- L34: `style={{ margin: 0, lineHeight: 1.6 }}` → `className="m-0 leading-[1.6]"`

- L38: `style={{ color: "#0f766e", fontWeight: 700 }}` → `className="text-[#0f766e] font-bold"`

**Preserved (3):**
- L22: style value is not an object literal — `style={previewShellStyle}`
- L23: style value is not an object literal — `style={previewCardStyle}`
- L25: unmappable property/value "letterSpacing: 0.18em" — `style={{
            margin: 0,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}`

## `packages/core/src/studio/layout/sidebar/modules/image/AssetGrid.tsx`

**Preserved (1):**
- L171: non-literal value for "width" — `style={{ width: `${Math.round(tile.progress * 100)}%` }}`

## `packages/core/src/studio/layout/sidebar/modules/layer/components/LayerRow.tsx`

**Preserved (1):**
- L98: non-literal value for "transform" — `style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingLeft: `${node.depth * 14 + 4}px`,
      }}`

## `packages/core/src/studio/layout/sidebar/modules/layer/components/LayerTree.tsx`

**Preserved (1):**
- L188: non-literal value for "paddingLeft" — `style={{ paddingLeft: `${depth * 14 + 4}px` }}`

## `packages/core/src/studio/layout/sidebar/modules/layer/components/PageRow.tsx`

**Preserved (2):**
- L233: style value is not an object literal — `style={sortableStyle}`
- L278: style value is not an object literal — `style={sortableStyle}`

## `packages/core/src/studio/primitives/vendor/animate-ui/components/base/tooltip.tsx`

**Preserved (1):**
- L65: style value is not an object literal — `style={style}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/animate/cursor.tsx`

**Preserved (2):**
- L211: unmappable property/value "transform: translate(-50%,-50%)" — `style={{
						transform: "translate(-50%,-50%)",
						pointerEvents: "none",
						zIndex: 9999,
						position: global ? "fixed" : "absolute",
						top: y,
						left: x,
						...style,
					}}`
- L361: unmappable property/value "transform: translate(-50%,-50%)" — `style={{
						transform: "translate(-50%,-50%)",
						pointerEvents: "none",
						zIndex: 9998,
						position: global ? "fixed" : "absolute",
						top: springY,
						left: springX,
						...style,
					}}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/accordion.tsx`

**Preserved (2):**
- L140: unmappable property/value "maskImage: linear-gradient(black var(--mask-stop), transparent var(--mask-stop))" — `style={{
								maskImage:
									"linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
								WebkitMaskImage:
									"linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
								overflow: "hidden",
							}}`
- L170: unmappable property/value "maskImage: linear-gradient(black var(--mask-stop), transparent var(--mask-stop))" — `style={{
									maskImage:
										"linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
									WebkitMaskImage:
										"linear-gradient(black var(--mask-stop), transparent var(--mask-stop))",
									overflow: "hidden",
								}}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/menu.tsx`

**Preserved (1):**
- L217: unmappable property/value "willChange: opacity, transform" — `style={{ willChange: "opacity, transform", ...style }}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/tabs.tsx`

**Preserved (1):**
- L178: contains spread (...style) — `style={{ overflow: "hidden", ...style }}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/toggle-group.tsx`

**Converted (1):**

- L160: `style={{
						position: "relative",
						zIndex: 1,
					}}` → `className="relative z-[1]"`

**Preserved (2):**
- L123: contains spread (...style) — `style={{ inset: 0, ...style }}`
- L150: contains spread (...style) — `style={{ position: "absolute", inset: 0, zIndex: 0, ...style }}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/toggle.tsx`

**Preserved (2):**
- L73: contains spread (...style) — `style={{ position: "absolute", zIndex: 0, inset: 0, ...style }}`
- L95: contains spread (...style) — `style={{ position: "relative", zIndex: 1, ...style }}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/base/tooltip.tsx`

**Preserved (1):**
- L167: non-literal value for "x" — `style={{
						x:
							followCursor === "x" || followCursor === true
								? translateX
								: undefined,
						y:
							followCursor === "y" || followCursor === true
								? translateY
								: undefined,
						...style,
					}}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/effects/auto-height.tsx`

**Preserved (1):**
- L47: contains spread (...style) — `style={{ overflow: "hidden", ...style }}`

## `packages/core/src/studio/primitives/vendor/animate-ui/primitives/effects/highlight.tsx`

**Preserved (5):**
- L262: className is an expression (cn()/template) — not merged — `style={{ position: "relative", zIndex: 1 }}`
- L291: contains spread (...style) — `style={{ position: "absolute", zIndex: 0, ...style }}`
- L535: contains spread (...style) — `style={{
									position: "absolute",
									zIndex: 0,
									...contextStyle,
									...style,
								}}`
- L561: className is an expression (cn()/template) — not merged — `style={{ position: "relative", zIndex: 1 }}`
- L597: contains spread (...style) — `style={{
								position: "absolute",
								zIndex: 0,
								...contextStyle,
								...style,
							}}`
