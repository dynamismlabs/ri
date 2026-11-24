import path from 'node:path';
import { uiSystemAllowlist } from './ui-system-allowlist.mjs';

const nativeElements = new Set(['button', 'input', 'select', 'textarea']);
const layoutText = /^(?:text-(?:left|right|center|justify|start|end|balance|pretty|wrap|nowrap|ellipsis|clip))$/;
function baseUtility(token) {
  let depth = 0, start = 0;
  for (let i = 0; i < token.length; i++) {
    if (token[i] === '[' || token[i] === '(') depth++;
    else if (token[i] === ']' || token[i] === ')') depth--;
    else if (token[i] === ':' && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!|!$/g, '');
}
export function isDrawingUtility(token) {
  const base = baseUtility(token);
  return !layoutText.test(base) && /^(?:bg-|border(?:$|-)|rounded(?:$|-)|h-|size-|text-|font-|leading-|tracking-|shadow(?:$|-)|ring(?:$|-)|outline(?:$|-)|opacity-|p[xysetrbl]?[-:]|uppercase$|lowercase$|capitalize$)/.test(base);
}
function nameOf(node) {
  if (node?.type === 'JSXIdentifier') return node.name;
  if (node?.type === 'JSXMemberExpression') return nameOf(node.object) + '.' + nameOf(node.property);
  return '';
}
function attributesOf(node) {
  return new Map(node.attributes.filter(a => a.type === 'JSXAttribute').map(a => [a.name.name, a]));
}
function staticAttribute(attribute) {
  if (attribute?.value?.type === 'Literal') return attribute.value.value;
  const expression = attribute?.value?.expression;
  return expression?.type === 'Literal' ? expression.value : undefined;
}
function ownerOf(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression') && parent.id) return parent.id.name;
    if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  }
  return '';
}
function fileMatches(entry, file) {
  return (!entry.file || entry.file === file) && (!entry.prefix || file.startsWith(entry.prefix)) && (!entry.suffix || file.endsWith(entry.suffix));
}
/** Every class string a className expression can produce: literals, cn() arguments, both branches, local aliases. */
function classStrings(context) {
  function values(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen.add(node);
    if (node.type === 'Identifier') {
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(node.name);
        if (variable) return variable.defs.flatMap(def => values(def.node.init, seen));
        scope = scope.upper;
      }
      return [];
    }
    if (node.type === 'MemberExpression') {
      const key = !node.computed && node.property.type === 'Identifier' ? node.property.name : node.property.type === 'Literal' ? node.property.value : undefined;
      return values(node.object, seen).flatMap(object => object.type === 'ObjectExpression' ? object.properties.filter(property => property.type === 'Property' && (key === undefined || (property.key.name ?? property.key.value) === key)).flatMap(property => values(property.value, new Set(seen))) : []);
    }
    if (node.type === 'ConditionalExpression') return [...values(node.consequent, new Set(seen)), ...values(node.alternate, new Set(seen))];
    return [node];
  }
  function strings(node, seen = new Set()) {
    if (!node || seen.has(node)) return [];
    seen.add(node);
    if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
    if (node.type === 'TemplateElement') return [node.value.raw];
    if (node.type === 'MemberExpression') return values(node).flatMap(value => strings(value, seen));
    if (node.type === 'Identifier') {
      let scope = context.sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(node.name);
        if (variable) return variable.defs.flatMap(def => strings(def.node.init, seen));
        scope = scope.upper;
      }
      return [];
    }
    return (context.sourceCode.visitorKeys[node.type] ?? []).flatMap(key => {
      const value = node[key]; return (Array.isArray(value) ? value : [value]).flatMap(child => strings(child, seen));
    });
  }
  return strings;
}
// A capsule drawn by hand: fully round with side padding. Labels use StatusBadge, chips ChipButton.
const handDrawnPill = tokens => tokens.some(token => baseUtility(token) === 'rounded-full') && tokens.some(token => /^p[xlrse]-/.test(baseUtility(token)));
const uiSystem = {
  rules: {
    'native-controls': {
      meta: { type: 'problem', schema: [], messages: { native: 'Use a system component for native {{element}}. A retained native boundary needs a named, reasoned uiSystemAllowlist entry.', excess: 'This native {{element}} exceeds the reviewed {{id}} count. Review the new declaration and its reason.' } },
      create(context) {
        const file = path.relative(context.cwd, context.filename).split(path.sep).join('/');
        const counts = new Map();
        return { JSXOpeningElement(node) {
          const name = nameOf(node.name), attrs = attributesOf(node);
          const element = staticAttribute(attrs.get('role')) === 'dialog' ? 'dialog-role' : name;
          if (!nativeElements.has(element) && element !== 'dialog-role') return;
          const entry = [...uiSystemAllowlist].sort((a,b)=>Object.keys(b.attributes??{}).length-Object.keys(a.attributes??{}).length).find(entry => fileMatches(entry, file) && entry.elements.includes(element) && (!entry.owner || entry.owner === ownerOf(node)) && Object.entries(entry.attributes ?? {}).every(([key, value]) => staticAttribute(attrs.get(key)) === value));
          if (!entry) { context.report({ node, messageId: 'native', data: { element } }); return; }
          const count = (counts.get(entry.id) ?? 0) + 1; counts.set(entry.id, count);
          if (entry.maxMatches && count > entry.maxMatches) context.report({ node, messageId: 'excess', data: { element, id: entry.id } });
        } };
      },
    },
    'drawing-classes': {
      meta: { type: 'problem', schema: [], messages: { drawing: '{{component}} owns drawing. Replace {{utilities}} with its named variants. className accepts layout only.' } },
      create(context) {
        const bindings = new Set(), namespaces = new Set();
        const strings = classStrings(context);
        return {
          ImportDeclaration(node) {
            if (!node.source.value.startsWith('@/components/system/')) return;
            for (const specifier of node.specifiers) {
              if (specifier.type === 'ImportNamespaceSpecifier') namespaces.add(specifier.local.name);
              else if (!/Primitive$/.test(specifier.imported?.name ?? specifier.local.name)) bindings.add(specifier.local.name);
            }
          },
          JSXOpeningElement(node) {
            const component = nameOf(node.name);
            if (!bindings.has(component) && !namespaces.has(component.split('.')[0])) return;
            for (const key of ['className', 'controlClassName', 'labelClassName']) {
              const attribute = attributesOf(node).get(key);
              if (!attribute) continue;
              const utilities = [...new Set(strings(attribute.value).flatMap(s => s.split(/\s+/)).filter(isDrawingUtility))];
              if (utilities.length) context.report({ node: attribute, messageId: 'drawing', data: { component, utilities: utilities.join(', ') } });
            }
          },
        };
      },
    },

    'hand-drawn-pills': {
      meta: { type: 'problem', schema: [], messages: { pill: 'A fully round label with side padding is drawn by the system. Use StatusBadge for a fact or ChipButton for an action, so it shares their size, colors and corner shape.' } },
      create(context) {
        const strings = classStrings(context);
        return { JSXOpeningElement(node) {
          const attribute = attributesOf(node).get('className');
          if (!attribute) return;
          if (handDrawnPill(strings(attribute.value).flatMap(value => value.split(/\s+/)))) context.report({ node: attribute, messageId: 'pill' });
        } };
      },
    },
  },
};

export default uiSystem;
