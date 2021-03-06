const sax = require('sax');
const slimdom = require('slimdom');

const defaultNamespaceMapping = {
	'': null,
	'xml': 'http://www.w3.org/XML/1998/namespace'
};

/*
 * Create the required callbacks for populating a new document from sax event handlers
 */
function createHandler () {
	const doc = new slimdom.Document();

	// Is rewritten as the handler traverses in and out of nodes
	let dom = doc;

	// Rewritten to accumulate a text stream
	let cdata = null;

	const namespaces = [defaultNamespaceMapping];
	let currentNamespaces = Object.create(defaultNamespaceMapping);

	return {
		onText: (text) => {
			if (dom.nodeType === slimdom.Node.DOCUMENT_NODE) {
				// Do not add text directly to document node (aka. outside document element)
				return;
			}
			dom.appendChild(doc.createTextNode(text));
		},

		onOpenTag: (node) => {
			namespaces.push(node.ns);
			currentNamespaces = Object.assign(currentNamespaces, node.ns);

			if (currentNamespaces[node.prefix] === undefined) {
				throw new Error(`Namespace prefix "${node.prefix}" not known for element "${node.name}"`);
			}

			dom = dom.appendChild(doc.createElementNS(currentNamespaces[node.prefix], node.name));

			// Set attributes, taking the accumulated namespace information into account
			Object.keys(node.attributes)
				.map(name => node.attributes[name])
				.filter(attr => attr.prefix !== 'xmlns' && !(attr.prefix === '' && attr.name === 'xmlns'))
				.forEach(attr => {
					if (currentNamespaces[attr.prefix] === undefined) {
						throw new Error(`Namespace prefix "${attr.prefix}" not known for attribute "${attr.name}"`);
					}

					dom.setAttributeNS(attr.prefix === '' ? null : currentNamespaces[attr.prefix], attr.name, attr.value);
			});
		},

		onCloseTag: () => {
			dom = dom.parentNode;

			if (!namespaces.pop()) {
				// The namespace info for the level that is popped was empty, so exit early
				return;
			}

			// Recalculate the (subset) portion of known namespace information
			currentNamespaces = namespaces.reduce((accum, ns) => Object.assign(accum, ns), {});
		},

		onProcessingInstruction: (pi) => {
			dom.appendChild(doc.createProcessingInstruction(pi.name, pi.body));
		},

		onComment: (comment) => {
			dom.appendChild(doc.createComment(comment));
		},

		onDocType: (data) => {
			const [
				qualifiedName,
				_publicSystem,
				publicId,
				systemId
			] = data.match(/(?:[^\s"]+|"[^"]*")+/g);

			dom.appendChild(doc.implementation.createDocumentType(
				qualifiedName,
				publicId && publicId.replace(/^"(.*)"$/, '$1') || '',
				systemId && systemId.replace(/^"(.*)"$/, '$1') || ''
			));
		},

		onOpenCdata: () => {
			cdata = '';
		},

		onCdata: (string) => {
			cdata += string;
		},

		onCloseCdata: () => {
			dom.appendChild(doc.createCDATASection(cdata));
			cdata = null;
		},

		getDocument: () => {
			return doc;
		}
	};
}

/*
 * Export the API of slimdom-sax-parser
 */
exports.slimdom = slimdom;

/**
 * Synchronously parse a string of XML to a Slimdom document
 * @param {string} xml
 * @returns {slimdom.Document}
 */
exports.sync = function synchronousSlimdomSaxParser (xml) {
	const handler = createHandler();

	// Set up the sax parser
	const parser = sax.parser(true, {
		xmlns: true
	});

	parser.ontext = handler.onText;
	parser.onopentag = handler.onOpenTag;
	parser.onclosetag = handler.onCloseTag;
	parser.onprocessinginstruction = handler.onProcessingInstruction;
	parser.oncomment = handler.onComment;
	parser.ondoctype = handler.onDocType;
	parser.onopencdata = handler.onOpenCdata;
	parser.oncdata = handler.onCdata;
	parser.onclosecdata = handler.onCloseCdata;

	parser.write(xml).close();

	return handler.getDocument();
};
