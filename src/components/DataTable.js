import _ from 'lodash/fp'
import { createRef, Fragment } from 'react'
import { div, h } from 'react-hyperscript-helpers'
import { AutoSizer } from 'react-virtualized'
import { buttonPrimary, Checkbox, Clickable, linkButton, MenuButton, RadioButton, spinnerOverlay } from 'src/components/common'
import { icon } from 'src/components/icons'
import Modal from 'src/components/Modal'
import PopupTrigger from 'src/components/PopupTrigger'
import { ColumnSelector, GridTable, HeaderCell, paginator, Resizable, Sortable } from 'src/components/table'
import { ajaxCaller } from 'src/libs/ajax'
import colors from 'src/libs/colors'
import { renderDataCell } from 'src/libs/data-utils'
import { reportError } from 'src/libs/error'
import * as StateHistory from 'src/libs/state-history'
import * as Utils from 'src/libs/utils'
import { Component } from 'src/libs/wrapped-components'


const filterState = (props, state) => _.pick(['pageNumber', 'itemsPerPage', 'sort'], state)

const entityMap = entities => {
  return _.fromPairs(_.map(e => [e.name, e], entities))
}

const applyColumnSettings = (columnSettings, columns) => {
  const lookup = _.flow(
    Utils.toIndexPairs,
    _.map(([i, v]) => ({ ...v, index: i })),
    _.keyBy('name')
  )(columnSettings)
  return _.flow(
    _.map(name => lookup[name] || { name, visible: true, index: -1 }),
    _.sortBy('index'),
    _.map(_.omit('index'))
  )(columns)
}


export default ajaxCaller(class DataTable extends Component {
  constructor(props) {
    super(props)

    const {
      entities,
      totalRowCount = 0, itemsPerPage = 25, pageNumber = 1,
      sort = { field: 'name', direction: 'asc' },
      columnWidths = {}, columnState = {}
    } = props.firstRender ? StateHistory.get() : {}

    this.table = createRef()
    this.state = {
      loading: false,
      viewData: undefined,
      entities, totalRowCount, itemsPerPage, pageNumber, sort, columnWidths, columnState
    }
  }

  render() {
    const {
      entityType, entityMetadata, workspaceId: { namespace },
      onScroll, initialX, initialY,
      selectionModel,
      childrenBefore
    } = this.props

    const { loading, entities, totalRowCount, itemsPerPage, pageNumber, sort, columnWidths, columnState, viewData } = this.state

    const theseColumnWidths = columnWidths[entityType] || {}
    const columnSettings = applyColumnSettings(columnState[entityType] || [], entityMetadata[entityType].attributeNames)
    const nameWidth = theseColumnWidths['name'] ||
      entityType === 'cohort' ? 265 : 150

    const resetScroll = () => this.table.current.scrollToTop()

    return h(Fragment, [
      !!entities && h(Fragment, [
        childrenBefore && childrenBefore({ entities, columnSettings }),
        div({ style: { flex: 1 } }, [
          h(AutoSizer, [
            ({ width, height }) => {
              return h(GridTable, {
                ref: this.table,
                width, height,
                rowCount: entities.length,
                onScroll,
                initialX,
                initialY,
                columns: [
                  ...(selectionModel ? [{
                    width: 70,
                    headerRenderer: selectionModel.type === 'multiple' ? () => {
                      return h(Fragment, [
                        h(Checkbox, {
                          checked: this.pageSelected(),
                          onChange: () => this.pageSelected() ? this.deselectPage() : this.selectPage()
                        }),
                        h(PopupTrigger, {
                          closeOnClick: true,
                          content: h(Fragment, [
                            h(MenuButton, { onClick: () => this.selectPage() }, ['Page']),
                            h(MenuButton, { onClick: () => this.selectAll() }, [`All (${totalRowCount})`]),
                            h(MenuButton, { onClick: () => this.selectNone() }, ['None'])
                          ]),
                          side: 'bottom'
                        }, [
                          h(Clickable, [icon('caretDown')])
                        ])
                      ])
                    } : () => div(),
                    cellRenderer: ({ rowIndex }) => {
                      const thisEntity = entities[rowIndex]
                      const { name } = thisEntity
                      const { type } = selectionModel

                      if (type === 'multiple') {
                        const { selected, setSelected } = selectionModel
                        const checked = _.has([name], selected)
                        return h(Checkbox, {
                          checked,
                          onChange: () => setSelected((checked ? _.unset([name]) : _.set([name], thisEntity))(selected))
                        })
                      } else if (type === 'single') {
                        const { selected, setSelected } = selectionModel
                        return h(RadioButton, {
                          checked: _.isEqual(selected, thisEntity),
                          onChange: () => setSelected(thisEntity)
                        })
                      }
                    }
                  }] : []),
                  {
                    width: nameWidth,
                    headerRenderer: () => h(Resizable, {
                      width: nameWidth, onWidthChange: delta => {
                        this.setState({ columnWidths: _.set(`${entityType}.name`, nameWidth + delta, columnWidths) },
                          () => this.table.current.recomputeColumnSizes())
                      }
                    }, [
                      h(Sortable, { sort, field: 'name', onSort: v => this.setState({ sort: v }) }, [
                        h(HeaderCell, [`${entityType}_id`])
                      ])
                    ]),
                    cellRenderer: ({ rowIndex }) => {
                      const dataCell = renderDataCell(entities[rowIndex].name, namespace)
                      return entityType === 'cohort' ?
                        div([dataCell, buttonPrimary({}, 'Open in Data Explorer')])
                      : dataCell
                    }
                  },
                  ..._.map(({ name }) => {
                    const thisWidth = theseColumnWidths[name] || 300
                    return {
                      width: thisWidth,
                      headerRenderer: () => h(Resizable, {
                        width: thisWidth, onWidthChange: delta => {
                          this.setState({ columnWidths: _.set(`${entityType}.${name}`, thisWidth + delta, columnWidths) },
                            () => this.table.current.recomputeColumnSizes())
                        }
                      }, [
                        h(Sortable, { sort, field: name, onSort: v => this.setState({ sort: v }) }, [
                          h(HeaderCell, [name])
                        ])
                      ]),
                      cellRenderer: ({ rowIndex }) => {
                        const dataInfo = entities[rowIndex].attributes[name]
                        const dataCell = renderDataCell(Utils.entityAttributeText(dataInfo), namespace)
                        return (!!dataInfo && _.isArray(dataInfo.items)) ?
                          linkButton({
                            onClick: () => this.setState({ viewData: dataInfo })
                          },
                          [dataCell]): dataCell
                      }
                    }
                  }, _.filter('visible', columnSettings))
                ]
              })
            }
          ]),
          h(ColumnSelector, {
            columnSettings,
            onSave: v => this.setState(_.set(['columnState', entityType], v), () => {
              this.table.current.recomputeColumnSizes()
            })
          })
        ]),
        div({ style: { flex: 'none', marginTop: '1rem' } }, [
          paginator({
            filteredDataLength: totalRowCount,
            pageNumber,
            setPageNumber: v => this.setState({ pageNumber: v }, resetScroll),
            itemsPerPage,
            setItemsPerPage: v => this.setState({ itemsPerPage: v, pageNumber: 1 }, resetScroll)
          })
        ])
      ]),
      !!viewData && h(Modal, {
        title: 'Contents',
        showButtons: false,
        showX: true,
        onDismiss: () => this.setState({ viewData: undefined })
      }, [div({ style: { maxHeight: '80vh', overflowY: 'auto' } }, [this.displayData(viewData)])]),
      loading && spinnerOverlay
    ])
  }

  componentDidMount() {
    this.loadData()
  }

  componentDidUpdate(prevProps, prevState) {
    if (!_.isEqual(filterState(prevProps, prevState), filterState(this.props, this.state)) || this.props.refreshKey !== prevProps.refreshKey) {
      this.loadData()
    }
    if (this.props.persist) {
      StateHistory.update(_.pick(['entities', 'totalRowCount', 'itemsPerPage', 'pageNumber', 'sort', 'columnWidths', 'columnState'], this.state))
    }
  }

  async loadData() {
    const {
      entityType, workspaceId: { namespace, name },
      ajax: { Workspaces }
    } = this.props

    const { pageNumber, itemsPerPage, sort } = this.state

    try {
      this.setState({ loading: true })
      const { results, resultMetadata: { unfilteredCount } } = await Workspaces.workspace(namespace, name)
        .paginatedEntitiesOfType(entityType, {
          page: pageNumber, pageSize: itemsPerPage, sortField: sort.field, sortDirection: sort.direction
        })
      this.setState({ entities: results, totalRowCount: unfilteredCount })
    } catch (error) {
      reportError('Error loading entities', error)
    } finally {
      this.setState({ loading: false })
    }
  }

  async selectAll() {
    const { entityType, workspaceId: { namespace, name }, ajax: { Workspaces }, selectionModel: { setSelected } } = this.props
    try {
      this.setState({ loading: true })
      const results = await Workspaces.workspace(namespace, name).entitiesOfType(entityType)
      setSelected(entityMap(results))
    } catch (error) {
      reportError('Error loading entities', error)
    } finally {
      this.setState({ loading: false })
    }
  }

  selectPage() {
    const { selectionModel: { selected, setSelected } } = this.props
    const { entities } = this.state
    setSelected(_.assign(selected, entityMap(entities)))
  }

  deselectPage() {
    const { selectionModel: { selected, setSelected } } = this.props
    const { entities } = this.state
    setSelected(_.omit(_.map(({ name }) => [name], entities), selected))
  }

  selectNone() {
    const { selectionModel: { setSelected } } = this.props
    setSelected({})
  }

  pageSelected() {
    const { selectionModel: { selected } } = this.props
    const { entities } = this.state
    const entityKeys = _.map('name', entities)
    const selectedKeys = _.keys(selected)
    return _.every(k => _.includes(k, selectedKeys), entityKeys)
  }

  displayData(selectedData) {
    const { itemsType, items } = selectedData
    return _.map(entity => div({ style: { borderBottom: `1px solid ${colors.gray[2]}`, padding: '0.5rem' } },
      itemsType === 'EntityReference' ? `${entity.entityName} (${entity.entityType})` : JSON.stringify(entity)), items)
  }
})
