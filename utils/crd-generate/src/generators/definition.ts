import {
  Definition,
  generateImports,
  generateInterface,
  Generator,
  getAPIVersion,
  GroupVersionKind,
  Import,
  OutputFile
} from "@kubernetes-models/generate";
import { formatComment, trimSuffix } from "@kubernetes-models/string-util";
import { getRelativePath, getSchemaPath } from "../utils";

function getFieldType(key: string[]): string | undefined {
  if (key.length === 1 && key[0] === "metadata") {
    return "V1ObjectMeta";
  }
}

function generateDefinition(
  gvk: GroupVersionKind,
  def: Definition
): OutputFile {
  const apiVersion = getAPIVersion(gvk);
  const className = gvk.kind;
  const interfaceName = `I${className}`;
  const imports: Import[] = [];
  const interfaceContent = generateInterface(def.schema, {
    includeDescription: true,
    getFieldType
  });
  const path = `${apiVersion}/${className}.ts`;
  let classContent = generateInterface(def.schema, {
    getFieldType(key) {
      if (key.length === 1) {
        return `${interfaceName}${JSON.stringify(key)}`;
      }
    }
  });
  let comment = "";

  classContent =
    trimSuffix(classContent, "}") +
    `
static apiVersion: ${interfaceName}["apiVersion"] = ${JSON.stringify(
      apiVersion
    )};
static kind: ${interfaceName}["kind"] = ${JSON.stringify(gvk.kind)};
static is = createTypeMetaGuard<${interfaceName}>(${className});

constructor(data?: ModelData<${interfaceName}>) {
  super();

  this.setDefinedProps({
    apiVersion: ${className}.apiVersion,
    kind: ${className}.kind,
    ...data
  } as ${interfaceName});
}
}
`;

  imports.push({
    name: "V1ObjectMeta",
    path: "@kubernetes-models/base"
  });

  imports.push({
    name: "Model",
    path: "@kubernetes-models/base"
  });

  imports.push({
    name: "ModelData",
    path: "@kubernetes-models/base"
  });

  imports.push({
    name: "setValidateFunc",
    path: "@kubernetes-models/base"
  });

  imports.push({
    name: "createTypeMetaGuard",
    path: "@kubernetes-models/base"
  });

  imports.push({
    name: "ValidateFunc",
    path: "@kubernetes-models/validate"
  });

  imports.push({
    name: "validate",
    path: getRelativePath(path, getSchemaPath(def.schemaId))
  });

  if (def.schema.description) {
    comment = formatComment(def.schema.description, {
      deprecated: /^deprecated/i.test(def.schema.description)
    });
  }

  const schema = transformSchema(def.schema);
  let kubernetesObj = 'KubernetesObject';

  // Spec is required
  if (classContent.includes('spec') && schema.required?.includes('spec')) { 
    kubernetesObj = 'KubernetesObjectWithSpec';

    imports.push({
      name: "KubernetesObjectWithSpec",
      path: "@kubernetes-models/base"
    });
  } else if (classContent.indexOf('spec') > -1) { // We have spec but it's not required
    kubernetesObj = 'KubernetesObjectWithOptionalSpec';

    imports.push({
      name: "KubernetesObjectWithOptionalSpec",
      path: "@kubernetes-models/base"
    });
  } else { // No spec
    imports.push({
      name: "KubernetesObject",
      path: "@kubernetes-models/base"
    });
  }

  return {
    path,
    content: `${generateImports(imports)}

${comment}export interface ${interfaceName} ${interfaceContent}

${comment}export class ${className} extends Model<${interfaceName}> implements ${interfaceName}, ${kubernetesObj} ${classContent}

setValidateFunc(${className}, validate as ValidateFunc<${interfaceName}>);
`
  };
}

const generateDefinitions: Generator = async (definitions) => {
  const output: OutputFile[] = [];

  for (const def of definitions) {
    const gvks = def.gvk;

    if (gvks && gvks.length) {
      output.push(generateDefinition(gvks[0], def));
    }
  }

  return output;
};

export default generateDefinitions;
