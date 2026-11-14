import { defineConfig } from 'vite';

// `--mode draft` builds the review copy. It says it's a draft, keeps search engines out, and lands in
// its own folder, so it can't be mistaken for the real site.
const NOTE = 'Draft for Eugene’s review. He hasn’t approved it yet, so please don’t pass this link on.';

const draftLabel = () => ({
  name: 'draft-label',
  transformIndexHtml(html) {
    return html
      .replace('</head>', '  <meta name="robots" content="noindex, nofollow">\n</head>')
      .replace('<body>', `<body>\n  <p class="draft">${NOTE}</p>`);
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_headers', source: '/*\n  X-Robots-Tag: noindex, nofollow\n' });
  },
});

export default defineConfig(({ mode }) => ({
  // Relative paths, so the site works at a domain root and under a sub-folder like user.github.io/portfolio/.
  base: './',
  plugins: mode === 'draft' ? [draftLabel()] : [],
  build: { outDir: mode === 'draft' ? 'dist-draft' : 'dist' },
}));
