import styles from "./marketing.module.css";

/**
 * Pure-CSS mock of the AnvilKit editor chrome (sidebar · canvas · inspector),
 * used as the hero's "product screenshot frame" (DESIGN.md treats the product
 * UI as the hero asset). No component stylesheets are imported here, so the
 * marketing pages stay light — the real editor lives at `/puck/editor`.
 */
export function EditorMockup() {
	return (
		<div className={styles.productFrame} aria-hidden="true">
			<div className={styles.mockBar}>
				<span className={styles.mockDot} />
				<span className={styles.mockDot} />
				<span className={styles.mockDot} />
				<span className={styles.mockUrl}>anvilkit · /puck/editor</span>
			</div>
			<div className={styles.mockBody}>
				<div className={styles.mockSidebar}>
					<span />
					<span />
					<span />
					<span />
					<span />
				</div>
				<div className={styles.mockCanvas}>
					<div className={styles.mockBlock}>
						<span className={`${styles.mockLine} ${styles.mockLineWide}`} />
						<span className={styles.mockLine} />
						<span className={styles.mockPill} />
					</div>
					<div className={`${styles.mockBlock} ${styles.mockBlockActive}`}>
						<span className={`${styles.mockLine} ${styles.mockLineWide}`} />
						<span className={styles.mockLine} />
						<span className={styles.mockLine} />
					</div>
					<div className={styles.mockBlock}>
						<span className={styles.mockLine} />
						<span className={styles.mockLine} />
					</div>
				</div>
				<div className={styles.mockInspector}>
					<span className={styles.mockField} />
					<span className={styles.mockField} />
					<span className={styles.mockField} />
					<span className={styles.mockField} />
				</div>
			</div>
		</div>
	);
}
