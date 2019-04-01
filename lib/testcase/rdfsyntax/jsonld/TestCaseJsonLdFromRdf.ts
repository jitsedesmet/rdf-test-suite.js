import * as RDF from "rdf-js";
import {Resource} from "rdf-object";
import {Util} from "../../../Util";
import {ITestCaseData} from "../../ITestCase";
import {ITestCaseHandler} from "../../ITestCaseHandler";
import {ISerializer} from "../ISerializer";
import {ITestCaseFromRdfSyntax} from "../ITestCaseFromRdfSyntax";
// tslint:disable:no-var-requires
const arrayifyStream = require('arrayify-stream');
const stringifyStream = require('stream-to-string');

/**
 * Test case handler for:
 * * https://w3c.github.io/json-ld-api/tests/vocab#FromRDFTest
 * * https://w3c.github.io/json-ld-api/tests/vocab#PositiveEvaluationTest
 *
 * It will check if the serialization from RDF to JSON-LD matches with the expected JSON-LD document.
 */
export class TestCaseJsonLdFromRdfHandler implements ITestCaseHandler<TestCaseJsonLdFromRdf> {

  public async resourceToTestCase(resource: Resource, testCaseData: ITestCaseData,
                                  cachePath?: string): Promise<TestCaseJsonLdFromRdf> {
    if (!resource.property.action) {
      throw new Error(`Missing mf:action in ${resource}`);
    }
    if (!resource.property.result) {
      throw new Error(`Missing mf:result in ${resource}`);
    }

    // Loop over the options
    let useNativeTypes: boolean = false;
    let useRdfType: boolean = false;
    let processingMode: string = null;
    let specVersion: string = '1.0';
    for (const option of resource.properties.jsonLdOptions) {
      // Should native types be used?
      if (option.property.useNativeTypes) {
        useNativeTypes = option.property.useNativeTypes.term.value === 'true';
      }

      // Should RDF type be used?
      if (option.property.useRdfType) {
        useRdfType = option.property.useRdfType.term.value === 'true';
      }

      // The processing mode
      // If undefined, all processors should be able to handle the test,
      // otherwise, only processors explicitly supporting that mode should run the test.
      if (option.property.processingMode) {
        // Remove the 'json-ld-' prefix from the string
        processingMode = option.property.processingMode.term.value.substr(8);
      }

      // The spec for which this test was defined.
      if (option.property.specVersion) {
        // Remove the 'json-ld-' prefix from the string
        specVersion = option.property.specVersion.term.value.substr(8);
      }
    }
    const options = { useNativeTypes, useRdfType, processingMode, specVersion };

    return new TestCaseJsonLdFromRdf(testCaseData,
      await arrayifyStream(<any> (await Util.fetchRdf(resource.property.action.value, cachePath, true))[1]),
      await stringifyStream((await Util.fetchCached(resource.property.result.value, cachePath)).body),
      resource.property.action.value, options);
  }

}

export class TestCaseJsonLdFromRdf implements ITestCaseFromRdfSyntax {
  public readonly type = "fromrdfsyntax";
  public readonly approval: string;
  public readonly approvedBy: string;
  public readonly comment: string;
  public readonly types: string[];
  public readonly name: string;
  public readonly uri: string;

  public readonly data: RDF.Quad[];
  public readonly expected: string;
  public readonly baseIRI: string;
  public readonly options: any;

  constructor(testCaseData: ITestCaseData, data: RDF.Quad[], expected: string, baseIRI: string, options: any) {
    Object.assign(this, testCaseData);
    this.data = data;
    this.expected = expected;
    this.baseIRI = baseIRI;
    this.options = options;
  }

  public async test(serializer: ISerializer, injectArguments: any): Promise<void> {
    const serialized: string = await serializer.serialize(this.data, this.baseIRI,
      { ...this.options, ...injectArguments });
    if (!objectsIsomorphic(JSON.parse(serialized), JSON.parse(this.expected))) {
      throw new Error(`Invalid data serialization
  Input: ${this.data}

  Expected: ${this.expected}

  Got: ${serialized}
`);
    }
  }

}

export function objectsIsomorphic(obj1: any, obj2: any) {
  // Loop through properties in object 1
  for (const p in obj1) {
    // Check property exists on obj2
    if (!(p in obj2)) {
      return false;
    }

    switch (typeof (obj1[p])) {
    case 'object':
      if (typeof obj2[p] !== 'object' || !objectsIsomorphic(obj1[p], obj2[p])) {
        return false;
      }
      break;
    // Compare values
    default:
      if (obj1[p] !== obj2[p]) {
        return false;
      }
    }
  }

  // Check object 2 for any extra properties
  for (const p in obj2) {
    if (!(p in obj1)) {
      return false;
    }
  }
  return true;
}
