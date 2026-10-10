// 37 个 Azure 区域：[code, 国别前缀, 英文名]
export const REGIONS = [
  ["eastus", "US", "East US"], ["eastus2", "US", "East US 2"],
  ["southcentralus", "US", "South Central US"], ["westus2", "US", "West US 2"],
  ["westus3", "US", "West US 3"], ["northcentralus", "US", "North Central US"],
  ["westcentralus", "US", "West Central US"], ["centralus", "US", "Central US"],
  ["japaneast", "JP", "Japan East"], ["japanwest", "JP", "Japan West"],
  ["koreacentral", "KR", "Korea Central"], ["koreasouth", "KR", "Korea South"],
  ["australiaeast", "AU", "Australia East"], ["australiasoutheast", "AU", "Australia Southeast"],
  ["centralindia", "IN", "Central India"], ["southindia", "IN", "South India"],
  ["southeastasia", "SG", "Southeast Asia"], ["eastasia", "SG", "East Asia"],
  ["westeurope", "EU", "West Europe"], ["northeurope", "EU", "North Europe"],
  ["francecentral", "EU", "France Central"], ["francesouth", "EU", "France South"],
  ["germanywestcentral", "EU", "Germany West Central"], ["uksouth", "EU", "UK South"],
  ["swedencentral", "EU", "Sweden Central"], ["switzerlandnorth", "EU", "Switzerland North"],
  ["switzerlandwest", "EU", "Switzerland West"], ["norwayeast", "EU", "Norway East"],
  ["spaincentral", "EU", "Spain Central"], ["polandcentral", "EU", "Poland Central"],
  ["italynorth", "EU", "Italy North"],
  ["canadacentral", "CA", "Canada Central"], ["canadaeast", "CA", "Canada East"],
  ["brazilsouth", "BR", "Brazil South"], ["mexicocentral", "MX", "Mexico Central"],
  ["uaenorth", "AE", "UAE North"], ["southafricanorth", "ZA", "South Africa North"],
];

export const regionLabel = ([code, cc, name]) => `(${cc}) ${name} ${code}`;
