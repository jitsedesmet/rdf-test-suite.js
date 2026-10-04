import type { RdfObjectLoader, Resource } from 'rdf-object';
import type { ITestCase } from './testcase/ITestCase';
import { testCaseFromResource } from './testcase/ITestCase';
import type { ITestCaseHandler } from './testcase/ITestCaseHandler';
import type { IFetchOptions } from './Util';
import { Util } from './Util';

/**
 * A manifest data holder.
 */
export interface IManifest {
  uri: string;
  label?: string;
  comment?: string;
  subManifests?: IManifest[];
  testEntries?: ITestCase<any>[];
  specifications?: Record<string, IManifest>;
}

/**
 * Create a manifest object from a resource.
 * @param {{[uri: string]: ITestCaseHandler<ITestCase<any>>}} testCaseHandlers Handlers for constructing test cases.
 * @param {IFetchOptions} options The fetch options.
 * @param {Resource} resource A resource.
 * @return {Promise<IManifest>} A promise resolving to a manifest object.
 */
export async function manifestFromResource(testCaseHandlers: Record<string, ITestCaseHandler<ITestCase<any>>>, options: IFetchOptions, resource: Resource, objectLoader: RdfObjectLoader): Promise<IManifest> {
  // An included manifest is referenced by its document URL, which may differ from the manifest's subject
  if (objectLoader && !isManifestResource(resource)) {
    resource = findManifestResource(objectLoader.resources, resource.value) ?? resource;
  }
  return {
    comment: resource.property.comment ? resource.property.comment.value : null,
    label: resource.property.label ? resource.property.label.value : null,
    specifications: resource.property.specifications ?
      await Util.promiseValues<IManifest>(
        Object.assign.apply({}, <any> await Promise.all(
          resource.property.specifications.list
            .map((specificationResource: Resource) =>
              ({ [specificationResource.term.value]:
                manifestFromSpecificationResource(testCaseHandlers, options, specificationResource, objectLoader) })),
        )),
      ) :
      null,
    subManifests: await Promise.all<IManifest>(
      <any> resource.properties.include.flatMap(
        (includeList: Resource) => includeList.list.map(res => manifestFromResource(testCaseHandlers, options, res, objectLoader)),
      ),
    ),
    testEntries: (await Promise.all<ITestCase<any>>(
      <any> resource.properties.entries.flatMap(
        (entryList: Resource) => (entryList.list || [ entryList ])
          .map(res => testCaseFromResource(testCaseHandlers, options, res, true)),
      ),
    ))
      .filter(Boolean)
      .flat(),
    uri: resource.value,
  };
}

/**
 * Check if the given resource describes a manifest,
 * i.e., it has a type, entries, includes, or specifications.
 * @param {Resource} resource A resource.
 * @return {boolean} If the resource describes a manifest.
 */
export function isManifestResource(resource?: Resource): boolean {
  return resource !== undefined && [ 'type', 'entries', 'include', 'specifications' ]
    .some(property => resource.properties[property].length > 0);
}

/**
 * Determine the candidate subject IRIs of the manifest in the document at the given URL, in order of priority.
 * @param {string} url The URL of a manifest document, optionally with a fragment naming the manifest.
 * @return {string[]} Candidate manifest IRIs.
 */
export function getManifestCandidateIris(url: string): string[] {
  const hashIndex = url.indexOf('#');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : undefined;
  url = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const dotIndex = url.lastIndexOf('.');
  const extLess = dotIndex > url.lastIndexOf('/') ? url.slice(0, dotIndex) : url;
  return [
    // The resource the caller explicitly named via a fragment, resolved against the document URL
    ...fragment ? [ `${url}#${fragment}` ] : [],
    // The document URL itself (`<>`)
    url,
    // The extension-less document URL (needed for RDFa test suite)
    extLess,
    // The extension-less document URL with a '#manifest' fragment (needed for SPARQL 1.2 test suite)
    `${extLess}#manifest`,
    // The extension-less document URL with the last '/' replaced with a '#' (needed for RDFstar test suite)
    // @see https://github.com/w3c/rdf-star/issues/269
    extLess.replace(/\/manifest$/u, '#manifest'),
  ];
}

/**
 * Find the manifest resource for the document at the given URL.
 * Candidates that do not describe a manifest (e.g. empty resources only used as include target) are skipped.
 * @param {Record<string, Resource>} resources The loaded resources.
 * @param {string} url The URL of a manifest document, optionally with a fragment naming the manifest.
 * @return {Resource | undefined} The manifest resource, or undefined if none was found.
 */
export function findManifestResource(
  resources: Record<string, Resource> | undefined,
  url: string,
): Resource | undefined {
  if (!resources) {
    return undefined;
  }
  for (const iri of getManifestCandidateIris(url)) {
    if (isManifestResource(resources[iri])) {
      return resources[iri];
    }
  }
  return undefined;
}

/**
 * Create a manifest object from a specification resource.
 * @param {{[uri: string]: ITestCaseHandler<ITestCase<any>>}} testCaseHandlers Handlers for constructing test cases.
 * @param {IFetchOptions} options The fetch options.
 * @param {Resource} resource A resource.
 * @return {Promise<IManifest>} A promise resolving to a manifest object.
 */
export async function manifestFromSpecificationResource(testCaseHandlers: Record<string, ITestCaseHandler<ITestCase<any>>>, options: IFetchOptions, resource: Resource, objectLoader: RdfObjectLoader): Promise<IManifest> {
  if (resource.property.conformanceRequirements) {
    const subManifests = await Promise.all<IManifest>(resource.property.conformanceRequirements.list
      .map(resource => manifestFromResource(testCaseHandlers, options, resource, objectLoader)));
    return {
      comment: resource.property.comment ? resource.property.comment.value : null,
      label: resource.property.label ? resource.property.label.value : null,
      subManifests,
      uri: resource.value,
    };
  }
  return {
    comment: resource.property.comment ? resource.property.comment.value : null,
    label: resource.property.label ? resource.property.label.value : null,
    uri: resource.value,
  };
}
