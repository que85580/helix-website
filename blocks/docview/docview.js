const transformDocContent = (element, blockCollectionBaseUrl) => {
  const clone = element.cloneNode(true);
  const resetAttributeBase = (tag, attr) => {
    clone.querySelectorAll(`${tag}[${attr}^="/"]`).forEach((elem) => {
      elem[attr] = new URL(elem.getAttribute(attr), blockCollectionBaseUrl).href;
    });
    clone.querySelectorAll(`${tag}[${attr}^="./"]`).forEach((elem) => {
      elem[attr] = new URL(elem.getAttribute(attr), blockCollectionBaseUrl).href;
    });
  };
  resetAttributeBase('a', 'href');
  resetAttributeBase('img', 'src');
  resetAttributeBase('source', 'srcset');

  return clone;
};

const classNameToBlockName = (className) => {
  const mapped = className
    .split(' ')
    .map((cls) => {
      const words = cls.split('-');
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    });

  return mapped.length > 1 ? `${mapped[0]} (${mapped.slice(1).join(', ')})` : mapped[0];
};

const fetchContentStucture = async (href) => {
  const { origin } = new URL(href);
  const response = await fetch(`${href}.plain.html`);
  if (response.ok) {
    const html = await response.text();
    const dp = new DOMParser();
    const doc = dp.parseFromString(html, 'text/html');

    const docWrapper = document.createElement('div');
    docWrapper.classList.add('document-viewer');

    const docInner = document.createElement('div');
    docInner.classList.add('document-inner');
    docWrapper.appendChild(docInner);

    const contentStructureContainer = document.createElement('div');
    contentStructureContainer.appendChild(docWrapper);

    const sections = doc.querySelectorAll('body > div');
    sections.forEach((section, i) => {
      [...section.children].forEach((child) => {
        const docContentWrapper = document.createElement('div');
        docContentWrapper.classList.add('document-content-wrapper');
        docInner.appendChild(docContentWrapper);

        if (child.tagName === 'DIV' && child.className) {
          const table = document.createElement('table');
          table.innerHTML = `
            <thead>
              <tr>
                <th>${classNameToBlockName(child.className)}</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          `;
          const rows = child.querySelectorAll(':scope > div');
          let maxcols = 0;
          rows.forEach((row) => {
            const tr = document.createElement('tr');
            const cols = row.querySelectorAll(':scope > div');
            const numCols = cols.length;
            if (numCols > maxcols) maxcols = numCols;
            cols.forEach((col) => {
              const td = document.createElement('td');
              td.append(transformDocContent(col, origin));
              tr.appendChild(td);
            });
            table.querySelector('tbody').appendChild(tr);
          });
          table.querySelector('thead > tr > th').setAttribute('colspan', maxcols);
          table.querySelectorAll('tbody > tr').forEach((tr) => {
            const tds = tr.querySelectorAll(':scope > td');
            if (tds.length < maxcols) {
              tds[0].setAttribute('colspan', maxcols - tds.length + 1);
            }
          });
          docContentWrapper.appendChild(table);
        } else {
          docContentWrapper.appendChild(transformDocContent(child, origin));
        }
      });
      if (sections.length > (i + 1)) {
        docInner.insertAdjacentHTML('beforeend', '<hr>');
      }
    });

    return contentStructureContainer;
  }

  throw new Error('failed to fetch block content');
};

/**
 * decorect the docivew
 * @param {Element} block the block element
 */
export default async function decorate(block) {
  const a = block.querySelector('a');
  let { href } = a;
  const { hostname } = new URL(href);
  if (hostname === window.location.hostname && a.textContent.startsWith('https://')) {
    href = a.textContent;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        fetchContentStucture(href).then((docView) => {
          block.replaceChildren(docView);
        });
        observer.disconnect();
      }
    });
  });
  observer.observe(block);
}
