export const BOARD_COLUMNS = `
query BoardColumns($boardId: [ID!]) {
  boards(ids: $boardId) {
    id
    columns { 
        id 
        title 
        type 
    }
  }
}
`;

export const ITEM_COLUMNS_BY_IDS = `
  query ItemColumnsByIds($itemId: [ID!], $columnIds: [String!]) {
    items(ids: $itemId) {
      id
      name
      column_values(ids: $columnIds) {
        id
        title
        text
        value
      }
    }
  }
`;

export const ITEM_NAME_AND_VALUES = `
  query ItemNameAndValues($itemId: [ID!]) {
    items(ids: $itemId) {
      name
      column_values {
        text
        column { title }
      }
    }
  }
`;

export const BOARD_NAME = `
query BoardName{
  boards{
    id
    name
    groups{
      id
      title
      items_page{
        items{
          id
          name
        }
      }
    }
  }
}
`

export const FILE_URL = `
query FileURL ($itemId: [ID!]) {
  items (ids: $itemId) {
    id
    name
    assets(assets_source: all) {  
      id
      name
      url
      public_url
      file_extension
      file_size
      uploaded_by { id name }
    }
  }
}

`;


export const ORDER_TYPES = `
  query OrderTypes($boardIds: [ID!], $groupIds: [String!]) {
    boards(ids: $boardIds) {
      groups(ids: $groupIds) {
        items_page {
          items {
            id
            name
          }
        }
      }
    }
  }
`;


export const ORDER_TYPES2 = `
query OrderTypes{
  boards{
    name
    groups{
      title
      items_page{
        items{
          id
          name
        }
      }
    }
  }
}
`;


export const FILE_NAMES = `
query FileURL ($itemId: [ID!]) {
  items (ids: $itemId) {
    id
    name
    assets(assets_source: all) {  
      id
      name
      url
      public_url
      file_extension
      file_size
      uploaded_by { id name }
    }
  }
}

`;

export const TEMPLATE_BOARD_AND_GROUP = `
  query TemplateBoardAndGroup {
    boards(limit: 25) {
      id
      name
      groups {
        id
        title
      }
    }
  }
`;
