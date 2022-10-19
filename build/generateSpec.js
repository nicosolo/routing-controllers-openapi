"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expressToOpenAPIPath = exports.getTags = exports.getSummary = exports.getSpec = exports.getResponses = exports.getStatusCode = exports.getContentType = exports.getRequestBody = exports.getQueryParams = exports.getPathParams = exports.getHeaderParams = exports.getPaths = exports.getOperationId = exports.getOperation = exports.getFullPath = exports.getFullExpressPath = void 0;
const tslib_1 = require("tslib");
const lodash_merge_1 = tslib_1.__importDefault(require("lodash.merge"));
const lodash_capitalize_1 = tslib_1.__importDefault(require("lodash.capitalize"));
const lodash_startcase_1 = tslib_1.__importDefault(require("lodash.startcase"));
const pathToRegexp = tslib_1.__importStar(require("path-to-regexp"));
require("reflect-metadata");
const decorators_1 = require("./decorators");
function getFullExpressPath(route) {
    const { action, controller, options } = route;
    return ((options.routePrefix || '') +
        (controller.route || '') +
        (action.route || ''));
}
exports.getFullExpressPath = getFullExpressPath;
function getFullPath(route) {
    return expressToOpenAPIPath(getFullExpressPath(route));
}
exports.getFullPath = getFullPath;
function getOperation(route, schemas) {
    const operation = {
        operationId: getOperationId(route),
        parameters: [
            ...getHeaderParams(route),
            ...getPathParams(route),
            ...getQueryParams(route, schemas),
        ],
        requestBody: getRequestBody(route) || undefined,
        responses: getResponses(route),
        summary: getSummary(route),
        tags: getTags(route),
    };
    const cleanedOperation = Object.entries(operation)
        .filter(([_, value]) => value && (value.length || Object.keys(value).length))
        .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
    }, {});
    return decorators_1.applyOpenAPIDecorator(cleanedOperation, route);
}
exports.getOperation = getOperation;
function getOperationId(route) {
    return `${route.action.target.name}.${route.action.method}`;
}
exports.getOperationId = getOperationId;
function getPaths(routes, schemas) {
    const routePaths = routes.map((route) => ({
        [getFullPath(route)]: {
            [route.action.type]: getOperation(route, schemas),
        },
    }));
    return lodash_merge_1.default(...routePaths);
}
exports.getPaths = getPaths;
function getHeaderParams(route) {
    const headers = route.params
        .filter((p) => p.type === 'header')
        .map((headerMeta) => {
        const schema = getParamSchema(headerMeta);
        return {
            in: 'header',
            name: headerMeta.name || '',
            required: isRequired(headerMeta, route),
            schema,
        };
    });
    const headersMeta = route.params.find((p) => p.type === 'headers');
    if (headersMeta) {
        const schema = getParamSchema(headersMeta);
        headers.push({
            in: 'header',
            name: schema.$ref.split('/').pop() || '',
            required: isRequired(headersMeta, route),
            schema,
        });
    }
    return headers;
}
exports.getHeaderParams = getHeaderParams;
function getPathParams(route) {
    const path = getFullExpressPath(route);
    const tokens = pathToRegexp.parse(path);
    return tokens
        .filter((token) => token && typeof token === 'object')
        .map((token) => {
        const name = token.name + '';
        const param = {
            in: 'path',
            name,
            required: !token.optional,
            schema: { type: 'string' },
        };
        if (token.pattern && token.pattern !== '[^\\/]+?') {
            param.schema = { pattern: token.pattern, type: 'string' };
        }
        const meta = route.params.find((p) => p.name === name && p.type === 'param');
        if (meta) {
            const metaSchema = getParamSchema(meta);
            param.schema =
                'type' in metaSchema ? Object.assign(Object.assign({}, param.schema), metaSchema) : metaSchema;
        }
        return param;
    });
}
exports.getPathParams = getPathParams;
function getQueryParams(route, schemas) {
    var _a;
    const queries = route.params
        .filter((p) => p.type === 'query')
        .map((queryMeta) => {
        const schema = getParamSchema(queryMeta);
        return {
            in: 'query',
            name: queryMeta.name || '',
            required: isRequired(queryMeta, route),
            schema,
        };
    });
    const queriesMeta = route.params.find((p) => p.type === 'queries');
    if (queriesMeta) {
        const paramSchema = getParamSchema(queriesMeta);
        const paramSchemaName = paramSchema.$ref.split('/').pop() || '';
        const currentSchema = schemas[paramSchemaName];
        for (const [name, schema] of Object.entries((currentSchema === null || currentSchema === void 0 ? void 0 : currentSchema.properties) || {})) {
            queries.push({
                in: 'query',
                name,
                required: (_a = currentSchema.required) === null || _a === void 0 ? void 0 : _a.includes(name),
                schema,
            });
        }
    }
    return queries;
}
exports.getQueryParams = getQueryParams;
function getNamedParamSchema(param) {
    const { type } = param;
    if (type === 'file') {
        return { type: 'string', format: 'binary' };
    }
    if (type === 'files') {
        return {
            type: 'array',
            items: {
                type: 'string',
                format: 'binary',
            },
        };
    }
    return getParamSchema(param);
}
function getRequestBody(route) {
    const bodyParamMetas = route.params.filter((d) => d.type === 'body-param');
    const uploadFileMetas = route.params.filter((d) => ['file', 'files'].includes(d.type));
    const namedParamMetas = [...bodyParamMetas, ...uploadFileMetas];
    const namedParamsSchema = namedParamMetas.length > 0
        ? namedParamMetas.reduce((acc, d) => (Object.assign(Object.assign({}, acc), { properties: Object.assign(Object.assign({}, acc.properties), { [d.name]: getNamedParamSchema(d) }), required: isRequired(d, route)
                ? [...(acc.required || []), d.name]
                : acc.required })), { properties: {}, required: [], type: 'object' })
        : null;
    const contentType = uploadFileMetas.length > 0 ? 'multipart/form-data' : 'application/json';
    const bodyMeta = route.params.find((d) => d.type === 'body');
    if (bodyMeta) {
        const bodySchema = getParamSchema(bodyMeta);
        const { $ref } = 'items' in bodySchema && bodySchema.items ? bodySchema.items : bodySchema;
        return {
            content: {
                [contentType]: {
                    schema: namedParamsSchema
                        ? { allOf: [bodySchema, namedParamsSchema] }
                        : bodySchema,
                },
            },
            description: ($ref || '').split('/').pop(),
            required: isRequired(bodyMeta, route),
        };
    }
    else if (namedParamsSchema) {
        return {
            content: { [contentType]: { schema: namedParamsSchema } },
        };
    }
}
exports.getRequestBody = getRequestBody;
function getContentType(route) {
    const defaultContentType = route.controller.type === 'json'
        ? 'application/json'
        : 'text/html; charset=utf-8';
    const contentMeta = route.responseHandlers.find((h) => h.type === 'content-type');
    return contentMeta ? contentMeta.value : defaultContentType;
}
exports.getContentType = getContentType;
function getStatusCode(route) {
    const successMeta = route.responseHandlers.find((h) => h.type === 'success-code');
    return successMeta ? successMeta.value + '' : '200';
}
exports.getStatusCode = getStatusCode;
function getResponses(route) {
    const contentType = getContentType(route);
    const successStatus = getStatusCode(route);
    return {
        [successStatus]: {
            content: { [contentType]: {} },
            description: 'Successful response',
        },
    };
}
exports.getResponses = getResponses;
function getSpec(routes, schemas) {
    return {
        components: { schemas: {} },
        info: { title: '', version: '1.0.0' },
        openapi: '3.0.0',
        paths: getPaths(routes, schemas),
    };
}
exports.getSpec = getSpec;
function getSummary(route) {
    return lodash_capitalize_1.default(lodash_startcase_1.default(route.action.method));
}
exports.getSummary = getSummary;
function getTags(route) {
    return [lodash_startcase_1.default(route.controller.target.name.replace(/Controller$/, ''))];
}
exports.getTags = getTags;
function expressToOpenAPIPath(expressPath) {
    const tokens = pathToRegexp.parse(expressPath);
    return tokens
        .map((d) => (typeof d === 'string' ? d : `${d.prefix}{${d.name}}`))
        .join('');
}
exports.expressToOpenAPIPath = expressToOpenAPIPath;
function isRequired(meta, route) {
    var _a, _b, _c;
    const globalRequired = (_c = (_b = (_a = route.options) === null || _a === void 0 ? void 0 : _a.defaults) === null || _b === void 0 ? void 0 : _b.paramOptions) === null || _c === void 0 ? void 0 : _c.required;
    return globalRequired ? meta.required !== false : !!meta.required;
}
function getParamSchema(param) {
    const { explicitType, index, object, method } = param;
    const type = Reflect.getMetadata('design:paramtypes', object, method)[index];
    if (typeof type === 'function' && type.name === 'Array') {
        const items = explicitType
            ? { $ref: '#/components/schemas/' + explicitType.name }
            : { type: 'object' };
        return { items, type: 'array' };
    }
    if (explicitType) {
        return { $ref: '#/components/schemas/' + explicitType.name };
    }
    if (typeof type === 'function') {
        if (type.prototype === String.prototype ||
            type.prototype === Symbol.prototype) {
            return { type: 'string' };
        }
        else if (type.prototype === Number.prototype) {
            return { type: 'number' };
        }
        else if (type.prototype === Boolean.prototype) {
            return { type: 'boolean' };
        }
        else if (type.name !== 'Object') {
            return { $ref: '#/components/schemas/' + type.name };
        }
    }
    return {};
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVTcGVjLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2dlbmVyYXRlU3BlYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7O0FBQ0Esd0VBQWlDO0FBQ2pDLGtGQUEyQztBQUMzQyxnRkFBeUM7QUFFekMscUVBQThDO0FBQzlDLDRCQUF5QjtBQUd6Qiw2Q0FBb0Q7QUFJcEQsU0FBZ0Isa0JBQWtCLENBQUMsS0FBYTtJQUM5QyxNQUFNLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsR0FBRyxLQUFLLENBQUE7SUFDN0MsT0FBTyxDQUNMLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxFQUFFLENBQUM7UUFDM0IsQ0FBQyxVQUFVLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN4QixDQUFDLE1BQU0sQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLENBQ3JCLENBQUE7QUFDSCxDQUFDO0FBUEQsZ0RBT0M7QUFLRCxTQUFnQixXQUFXLENBQUMsS0FBYTtJQUN2QyxPQUFPLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUE7QUFDeEQsQ0FBQztBQUZELGtDQUVDO0FBS0QsU0FBZ0IsWUFBWSxDQUMxQixLQUFhLEVBQ2IsT0FBeUM7SUFFekMsTUFBTSxTQUFTLEdBQXVCO1FBQ3BDLFdBQVcsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDO1FBQ2xDLFVBQVUsRUFBRTtZQUNWLEdBQUcsZUFBZSxDQUFDLEtBQUssQ0FBQztZQUN6QixHQUFHLGFBQWEsQ0FBQyxLQUFLLENBQUM7WUFDdkIsR0FBRyxjQUFjLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQztTQUNsQztRQUNELFdBQVcsRUFBRSxjQUFjLENBQUMsS0FBSyxDQUFDLElBQUksU0FBUztRQUMvQyxTQUFTLEVBQUUsWUFBWSxDQUFDLEtBQUssQ0FBQztRQUM5QixPQUFPLEVBQUUsVUFBVSxDQUFDLEtBQUssQ0FBQztRQUMxQixJQUFJ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