// eslint-disable-next-line import/no-relative-packages
import { DataChunks } from './cruncher.js';
import DataLoader from './loader.js';

import {
  toHumanReadable,
  reclassifyAcquisition,
} from './utils.js';

const BUNDLER_ENDPOINT = 'https://rum.fastly-aem.page';
// const BUNDLER_ENDPOINT = 'http://localhost:3000';
const API_ENDPOINT = BUNDLER_ENDPOINT;

const { searchParams } = new URL(window.location);

const getURL = () => {
  const url = searchParams.get('url');

  if (!url) {
    throw new Error('No url provided');
  }

  return url;
};

const getDomain = () => {
  const url = getURL();

  const { hostname } = new URL(url);
  return hostname;
};

const getarticlesRootURL = () => {
  const url = getURL();
  const { pathname, origin } = new URL(url);
  // find year in pathname
  const year = pathname.match(/\/\d{4}\//);
  if (!year) {
    throw new Error('No year found in pathname');
  }
  return `${origin}${pathname.substring(0, year.index)}`;
};

class URLReports {
  constructor(config) {
    this.start = config.start;
    this.end = config.end;
    this.data = null;
    this.root = config.articlesRootURL;

    const loader = new DataLoader();
    loader.apiEndpoint = API_ENDPOINT;
    loader.domain = config.domain;
    loader.domainKey = config.domainKey;

    this.loader = loader;
  }

  async init() {
    this.data = await this.loader.fetchPeriod(this.start, this.end);

    const dataChunks = new DataChunks();

    dataChunks.addSeries('pageViews', (bundle) => bundle.weight);
    dataChunks.addSeries('visits', (bundle) => (bundle.visit ? bundle.weight : 0));
    // a bounce is a visit without a click
    dataChunks.addSeries('bounces', (bundle) => (bundle.visit && !bundle.events.find(({ checkpoint }) => checkpoint === 'click')
      ? bundle.weight
      : 0));

    dataChunks.addSeries('engagement', (bundle) => {
      const clickEngagement = dataChunks.hasConversion(bundle, {
        checkpoint: ['click'],
      })
        ? bundle.weight
        : 0;
      const contentEngagement = bundle.events
        .filter((evt) => evt.checkpoint === 'viewmedia' || evt.checkpoint === 'viewblock')
        .length > 3
        ? bundle.weight
        : 0;
      return clickEngagement || contentEngagement;
    });

    dataChunks.addSeries('conversions', (bundle) => (dataChunks.hasConversion(bundle, { 'hasclick&source': [true] }) ? bundle.weight : 0));

    dataChunks.addSeries('organic', (bundle) => {
      const reclassified = bundle.events
        .map(reclassifyAcquisition);
      if (!reclassified.find((evt) => evt.checkpoint === 'enter')) {
        // we only consider enter events
        return 0;
      }
      if (!reclassified.find((evt) => evt.checkpoint === 'acquisition')) {
        // this is fully organic, as there are no traces of any acquisition
        return bundle.weight;
      }
      if (reclassified.find((evt) => evt.checkpoint === 'acquisition' && evt.source.startsWith('paid'))) {
        // this is paid, as there is at least one paid acquisition
        return 0;
      }
      return bundle.weight;
    });

    dataChunks.addSeries('timeOnPage', (bundle) => {
      const deltas = bundle.events
        .map((evt) => evt.timeDelta)
        .filter((delta) => delta > 0);
      if (deltas.length === 0) {
        return undefined;
      }
      return Math.max(...deltas, 0) / 1000;
    });

    dataChunks.addSeries('contentEngagement', (bundle) => {
      const viewEvents = bundle.events
        .filter((evt) => evt.checkpoint === 'viewmedia' || evt.checkpoint === 'viewblock');
      return viewEvents.length;
    });

    dataChunks.addFacet('checkpoint', (bundle) => bundle.checkpoint);
    dataChunks.addFacet('url', (bundle) => bundle.url);
    dataChunks.addFacet('hasclick', (bundle) => {
      const a = bundle.events
        .filter((event) => event.checkpoint === 'click');
      return a.length > 0;
    });
    dataChunks.addFacet('hasclick&source', (bundle) => {
      const a = bundle.events
        .filter((event) => event.checkpoint === 'click' && event.source === '.button');
      return a.length > 0;
    });

    const prefix = this.root;

    dataChunks.addFacet('underroot', (bundle) => {
      if (!bundle.url) return false;
      return bundle.url.startsWith(prefix);
    });

    const possiblePrefixes = [];
    const s = new Date(this.start);
    const e = new Date(this.end);

    // iterate each day between start and end
    for (let d = s; d <= e; d.setDate(d.getDate() + 1)) {
      const day = new Date(d);
      const datePattern = day.toISOString().split('T')[0].replace(/-/g, '/');
      const pattern = `${prefix}/${datePattern}`;
      possiblePrefixes.push(pattern);
    }
    dataChunks.addFacet('inrange', (bundle) => {
      if (!bundle.url || !bundle.url.startsWith(prefix)) return false;
      for (let i = 0; i < possiblePrefixes.length; i += 1) {
        if (bundle.url.startsWith(possiblePrefixes[i])) {
          return true;
        }
      }
      return false;
    });

    dataChunks.addFacet('media', (bundle) => Array.from(
      bundle.events
        .filter((evt) => evt.checkpoint === 'viewmedia')
        .filter(({ target }) => target) // filter out empty targets
        .reduce((acc, { target }) => {
          if (typeof target === 'string') {
            const mi = target.indexOf('/media_');
            if (mi) {
              const u = new URL(target);
              acc.add(u.pathname.substring(u.pathname.lastIndexOf('/') + 1));
            }
          }
          return acc;
        }, new Set()),
    ));

    dataChunks.load(this.data);
    this.dataChunks = dataChunks;
  }

  getFacets() {
    return this.dataChunks.facets;
  }

  getURLs() {
    return this.dataChunks.facets.url;
  }

  getMedia() {
    return this.dataChunks.facets.media;
  }

  set filter(filter) {
    this.dataChunks.filter = filter;
  }
}

const getConfig = () => {
  const config = {
    domain: getDomain(),
    domainKey: searchParams.get('domainkey') || '',
    apiEndpoint: API_ENDPOINT,
    start: searchParams.get('start'),
    end: searchParams.get('end'),
    url: getURL(),
    articlesRootURL: getarticlesRootURL(),
  };

  return config;
};

const getDetails = async (url, articlesRootURL) => {
  const resp = await fetch(url);
  const html = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const title = doc.querySelector('title')?.textContent || '';
  const description = doc.querySelector('meta[name="description"]')?.content || '';
  const author = doc.querySelector('meta[name="author"]')?.content || '';

  let publicationDate = doc.querySelector('meta[name="publication-date"]')?.content;
  if (!publicationDate) {
    // extract date from url
    const pathname = url.substring(articlesRootURL.length + 1);
    const date = pathname.match(/\d{4}\/\d{2}\/\d{2}/);
    publicationDate = date ? date[0] : '';
  }

  return {
    title, description, url, author, publicationDate,
  };
};

const SERIES = {
  pageViews: {
    label: 'Page Views',
    rateFn: (aggregate) => aggregate.pageViews.sum,
    labelFn: (value) => toHumanReadable(value),
  },
  bounce: {
    label: 'Bounce Rate (surfer never clicked)',
    rateFn: (aggregate) => Math.round(
      (100 * aggregate.bounces.sum) / aggregate.visits.sum,
    ),
    labelFn: (value) => `${value || 0}%`,
  },
  engagement: {
    label: 'Page Engagement (surfer clicked "something" on page or viewed more than 3 media or blocks)',
    rateFn: (aggregate) => Math.round(
      (100 * aggregate.engagement.sum) / aggregate.pageViews.sum,
    ),
    labelFn: (value) => `${value || 0}%`,
  },
  conversions: {
    label: 'Conversion Rate (surfer clicked on CTA button)',
    rateFn: (aggregate) => Math.min(Math.round(
      (100 * aggregate.conversions.sum) / aggregate.visits.sum,
    ), 100),
    labelFn: (value) => `${value}%`,
  },
  organic: {
    label: 'Organic Percentage',
    rateFn: (aggregate) => Math.round(
      (100 * aggregate.organic.sum) / aggregate.visits.sum,
    ),
    labelFn: (value) => `${value || 0}%`,
  },
  timeOnPage: {
    label: 'Time on page',
    rateFn: (aggregate) => aggregate.timeOnPage.percentile(50),
    labelFn: (value) => `${Number.isFinite(value) ? value : 0}s`,
  },
};

const toReportURL = (url) => {
  const u = new URL(window.location.href);
  u.searchParams.delete('url');
  u.searchParams.set('url', url);
  return u.toString();
};

const main = async () => {
  const config = getConfig();

  const period = document.getElementById('period');
  period.innerHTML = `from ${config.start} to ${config.end}`;

  getDetails(config.url, config.articlesRootURL).then((details) => {
    const detailsElement = document.getElementById('details');
    detailsElement.innerHTML = `
      <ul>
        <li><label>URL: </label><a href="${details.url}" target="_blank">${details.url}</a></li>
        <li><label>Title: </label><span>${details.title}</span></li>
        <li><label>Auhor: </label><span>${details.author}</span></li>
        <li><label>Publication Date: </label><span>${details.publicationDate}</span></li>
        <li><label>Description: </label><span>${details.title}</p></span>
      </ul>
    `;
  });

  const report = new URLReports(config);
  report.init().then(() => {
    report.filter = {
      url: [config.url],
    };

    let facets = report.getFacets();

    const currentPageEntry = facets.url.find((entry) => entry.value === config.url);
    const { media } = facets;

    if (!currentPageEntry) {
      throw new Error('Current page not found in report');
    }

    let metrics = currentPageEntry.getMetrics(['pageViews', 'organic', 'visits', 'bounces', 'engagement', 'conversions', 'timeOnPage']);

    const businessMetricsElement = document.getElementById('businessMetrics');
    let ul = document.createElement('ul');
    businessMetricsElement.appendChild(ul);
    Object.keys(SERIES).forEach((key) => {
      const series = SERIES[key];
      const value = series.rateFn(metrics);
      const display = series.labelFn(value);

      const li = document.createElement('li');
      li.innerHTML = `<label>${series.label}: </label><span>${display}</span>`;
      ul.appendChild(li);
    });

    const mediaElement = document.getElementById('media');
    ul = document.createElement('ul');
    mediaElement.appendChild(ul);

    media.forEach((mi) => {
      const li = document.createElement('li');
      li.classList.add('media');
      li.innerHTML = `<img src="${config.url}/${mi.value}"> / ${mi.value} / ${toHumanReadable(mi.weight)}`;
      ul.appendChild(li);
    });

    report.filter = {
      underroot: [true],
    };

    facets = report.getFacets();

    const top10Element = document.getElementById('top10');
    ul = document.createElement('ul');
    top10Element.appendChild(ul);
    for (let i = 0; i < Math.min(10, facets.url.length); i += 1) {
      const entry = facets.url[i];
      metrics = entry.getMetrics(['pageViews']);
      const li = document.createElement('li');
      li.innerHTML = `<a href="${toReportURL(entry.value)}" target="_blank">${entry.value} (${toHumanReadable(metrics.pageViews.sum)})</a>`;
      ul.appendChild(li);
    }

    report.filter = {
      inrange: [true],
    };

    facets = report.getFacets();

    const top10ReleasedElement = document.getElementById('top10released');
    ul = document.createElement('ul');
    top10ReleasedElement.appendChild(ul);
    for (let i = 0; i < Math.min(10, facets.url.length); i += 1) {
      const entry = facets.url[i];
      metrics = entry.getMetrics(['pageViews']);
      const li = document.createElement('li');
      li.innerHTML = `<a href="${toReportURL(entry.value)}" target="_blank">${entry.value} / (${toHumanReadable(metrics.pageViews.sum)})</a>`;
      ul.appendChild(li);
    }
  });
};

main();
