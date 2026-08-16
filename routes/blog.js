'use strict';
const express = require('express');
const router = express.Router();
const { getDB } = require('../db/db');

const SITE = process.env.SITE_URL || 'https://www.richmanassets.in';
const canon = (p) => SITE + p;

function normalize(row) {
  return {
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : (typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : []),
    faq: Array.isArray(row.faq) ? row.faq : (typeof row.faq === 'string' ? JSON.parse(row.faq || '[]') : []),
  };
}

async function getPublishedPosts(db) {
  const { data, error } = await db.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
  if (error) { console.error('[blog] list error:', error.message); return []; }
  return (data || []).map(normalize);
}

// ── INDEX ────────────────────────────────────────────────────────
router.get('/blog', async (req, res) => {
  try {
    const db = getDB();
    const posts = await getPublishedPosts(db);
    const category = (req.query.category || '').trim();
    const filtered = category ? posts.filter(p => p.category === category) : posts;
    const categories = [...new Set(posts.map(p => p.category))];

    const blogLd = {
      '@context': 'https://schema.org', '@type': 'Blog',
      '@id': canon('/blog') + '#blog',
      name: 'RichManAssets Property Guides — Udupi & Mangaluru Real Estate',
      description: 'Practical guides on buying, selling, renting and investing in property across Udupi, Manipal and coastal Karnataka.',
      url: canon('/blog'),
      publisher: { '@id': SITE + '/#organization' },
      blogPost: posts.slice(0, 12).map(p => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: canon('/blog/' + p.slug),
        datePublished: p.published_at,
        dateModified: p.updated_at,
      })),
    };
    const breadcrumbLd = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Property Guides', item: canon('/blog') },
      ],
    };

    res.render('blog', {
      title: 'Udupi Real Estate Guides — Buying, Investing & NRI Property Advice | RichManAssets',
      description: 'Practical, fact-checked guides on buying, renting, investing and financing property in Udupi, Manipal and coastal Karnataka — written by consultants who close these deals.',
      keywords: 'udupi real estate blog, property guides udupi, buying property udupi, nri property guide, udupi property investment',
      geoPlace: 'Udupi, Karnataka, India',
      canonical: canon('/blog'), siteUrl: SITE,
      jsonld: JSON.stringify([blogLd, breadcrumbLd]).replace(/</g, '\\u003c'),
      posts: filtered, categories, activeCategory: category,
    });
  } catch (err) {
    console.error('[/blog] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

// ── POST DETAIL ──────────────────────────────────────────────────
router.get('/blog/:slug', async (req, res) => {
  try {
    const db = getDB();
    const { data: row } = await db.from('blog_posts').select('*').eq('slug', req.params.slug).eq('status', 'published').maybeSingle();
    if (!row) return res.status(404).render('404', { title: 'Guide not found | RichManAssets' });

    const post = normalize(row);
    const allPosts = await getPublishedPosts(db);
    const related = allPosts.filter(p => p.id !== post.id && p.category === post.category).slice(0, 3);
    const fallback = related.length ? related : allPosts.filter(p => p.id !== post.id).slice(0, 3);

    const articleLd = {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: post.title,
      description: post.excerpt,
      image: post.cover_image ? [canon(post.cover_image)] : undefined,
      author: { '@type': 'Organization', name: post.author_name, '@id': SITE + '/#organization' },
      publisher: { '@id': SITE + '/#organization' },
      datePublished: post.published_at,
      dateModified: post.updated_at,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canon('/blog/' + post.slug) },
    };
    const breadcrumbLd = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: canon('/') },
        { '@type': 'ListItem', position: 2, name: 'Property Guides', item: canon('/blog') },
        { '@type': 'ListItem', position: 3, name: post.title, item: canon('/blog/' + post.slug) },
      ],
    };
    const jsonldBlocks = [articleLd, breadcrumbLd];
    if (post.faq && post.faq.length) {
      jsonldBlocks.push({
        '@context': 'https://schema.org', '@type': 'FAQPage',
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.faq-answer'] },
        mainEntity: post.faq.map(f => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      });
    }

    res.render('blog-post', {
      title: post.seo_title || `${post.title} | RichManAssets`,
      description: post.seo_description || post.excerpt,
      keywords: post.seo_keywords,
      geoPlace: 'Udupi, Karnataka, India',
      canonical: canon('/blog/' + post.slug), siteUrl: SITE,
      ogType: 'article', ogImage: post.cover_image,
      jsonld: JSON.stringify(jsonldBlocks).replace(/</g, '\\u003c'),
      post, related: fallback,
    });
  } catch (err) {
    console.error('[/blog/:slug] error:', err.message);
    res.status(500).render('404', { title: 'Error | RichManAssets' });
  }
});

module.exports = router;
module.exports.getPublishedPosts = getPublishedPosts;
