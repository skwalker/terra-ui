import _ from 'lodash/fp'
import { Fragment } from 'react'
import { a, b, div, h } from 'react-hyperscript-helpers'
import { pure } from 'recompose'
import { buttonPrimary, Clickable, linkButton, PageBox, search, spinnerOverlay } from 'src/components/common'
import { icon } from 'src/components/icons'
import { validatedInput } from 'src/components/input'
import Modal from 'src/components/Modal'
import TopBar from 'src/components/TopBar'
import { ajaxCaller } from 'src/libs/ajax'
import colors from 'src/libs/colors'
import { reportError } from 'src/libs/error'
import { formHint, RequiredFormLabel } from 'src/libs/forms'
import * as Nav from 'src/libs/nav'
import * as StateHistory from 'src/libs/state-history'
import * as Style from 'src/libs/style'
import * as Utils from 'src/libs/utils'
import { Component } from 'src/libs/wrapped-components'
import { validate } from 'validate.js'


const groupNameValidator = existing => ({
  presence: { allowEmpty: false },
  format: {
    pattern: /[A-Za-z0-9_-]*$/,
    message: 'can only contain letters, numbers, underscores, and dashes'
  },
  exclusion: {
    within: existing,
    message: 'already exists'
  }
})

const NewGroupModal = ajaxCaller(class NewGroupModal extends Component {
  constructor(props) {
    super(props)
    this.state = {
      groupName: '',
      groupNameTouched: false
    }
  }

  render() {
    const { onDismiss, existingGroups } = this.props
    const { groupName, groupNameTouched, submitting } = this.state

    const errors = validate({ groupName }, { groupName: groupNameValidator(existingGroups) })

    return h(Modal, {
      onDismiss,
      title: 'Create New Group',
      okButton: buttonPrimary({
        disabled: errors,
        onClick: () => this.submit()
      }, ['Create Group'])
    }, [
      h(RequiredFormLabel, ['Enter a unique name']),
      validatedInput({
        inputProps: {
          autoFocus: true,
          value: groupName,
          onChange: e => this.setState({ groupName: e.target.value, groupNameTouched: true })
        },
        error: groupNameTouched && Utils.summarizeErrors(errors && errors.groupName)
      }),
      !(groupNameTouched && errors) && formHint('Only letters, numbers, underscores, and dashes allowed'),
      submitting && spinnerOverlay
    ])
  }

  async submit() {
    const { onSuccess, ajax: { Groups } } = this.props
    const { groupName } = this.state

    try {
      this.setState({ submitting: true })
      await Groups.group(groupName).create()
      onSuccess()
    } catch (error) {
      this.setState({ submitting: false })
      reportError('Error creating group', error)
    }
  }
})

const DeleteGroupModal = pure(({ groupName, onDismiss, onSubmit }) => {
  return h(Modal, {
    onDismiss,
    title: 'Confirm',
    okButton: buttonPrimary({
      onClick: onSubmit
    }, ['Delete Group'])
  }, [
    'Are you sure you want to delete the group ',
    b([`${groupName}?`])
  ])
})

const GroupCard = pure(({ group: { groupName, groupEmail, role }, onDelete }) => {
  const isAdmin = !!_.includes('admin', role)

  return div({ style: Style.cardList.longCard }, [
    a({
      href: isAdmin ? Nav.getLink('group', { groupName }) : undefined,
      style: {
        ...Style.cardList.longTitle,
        marginRight: '1rem',
        width: '30%', color: isAdmin ? colors.green[0] : undefined
      }
    }, [groupName]),
    div({ style: { flexGrow: 1 } }, [groupEmail]),
    div({ style: { width: 100, display: 'flex', alignItems: 'center' } }, [
      div({ style: { flexGrow: 1 } }, [isAdmin ? 'Admin' : 'Member']),
      isAdmin && linkButton({
        onClick: onDelete,
        style: { margin: '-1rem', padding: '1rem' }
      }, [
        icon('trash', { className: 'is-solid', size: 17 })
      ])
    ])
  ])
})

const NewGroupCard = pure(({ onClick }) => {
  return h(Clickable, {
    style: Style.cardList.shortCreateCard,
    onClick
  }, [
    div(['Create a']),
    div(['New Group']),
    icon('plus-circle', { style: { marginTop: '0.5rem' }, size: 21 })
  ])
})

export const GroupList = ajaxCaller(class GroupList extends Component {
  constructor(props) {
    super(props)
    this.state = {
      filter: '',
      groups: null,
      creatingNewGroup: false,
      deletingGroup: false,
      updating: false,
      ...StateHistory.get()
    }
  }

  async refresh() {
    const { ajax: { Groups } } = this.props

    try {
      this.setState({ isDataLoaded: false, creatingNewGroup: false, deletingGroup: false, updating: false })
      const rawGroups = await Groups.list()
      const groups = _.flow(
        _.groupBy('groupName'),
        _.map(gs => ({ ...gs[0], role: _.map('role', gs) })),
        _.sortBy('groupName')
      )(rawGroups)
      this.setState({ groups, isDataLoaded: true })
    } catch (error) {
      reportError('Error loading group list', error)
    }
  }

  componentDidMount() {
    this.refresh()
  }

  render() {
    const { groups, isDataLoaded, filter, creatingNewGroup, deletingGroup, updating } = this.state
    const { ajax: { Groups } } = this.props
    return h(Fragment, [
      h(TopBar, { title: 'Groups' }, [
        search({
          wrapperProps: { style: { marginLeft: '2rem', flexGrow: 1, maxWidth: 500 } },
          inputProps: {
            placeholder: 'SEARCH GROUPS',
            onChange: e => this.setState({ filter: e.target.value }),
            value: filter
          }
        })
      ]),
      h(PageBox, [
        div({ style: Style.cardList.toolbarContainer }, [
          div({ style: { ...Style.elements.sectionHeader, textTransform: 'uppercase' } }, [
            'Group Management'
          ])
        ]),
        div({ style: Style.cardList.cardContainer }, [
          h(NewGroupCard, {
            onClick: () => this.setState({ creatingNewGroup: true })
          }),
          div({ style: { flexGrow: 1 } }, [
            _.flow(
              _.filter(({ groupName }) => Utils.textMatch(filter, groupName)),
              _.map(group => {
                return h(GroupCard, {
                  group, key: `${group.groupName}`,
                  onDelete: () => this.setState({ deletingGroup: group })
                })
              })
            )(groups)
          ]),
          !isDataLoaded && spinnerOverlay
        ]),
        creatingNewGroup && h(NewGroupModal, {
          existingGroups: _.map('groupName', groups),
          onDismiss: () => this.setState({ creatingNewGroup: false }),
          onSuccess: () => this.refresh()
        }),
        deletingGroup && h(DeleteGroupModal, {
          groupName: deletingGroup.groupName,
          onDismiss: () => this.setState({ deletingGroup: false }),
          onSubmit: async () => {
            try {
              this.setState({ deletingGroup: false, updating: true })
              await Groups.group(deletingGroup.groupName).delete()
              this.refresh()
            } catch (error) {
              this.setState({ updating: false })
              reportError('Error deleting group', error)
            }
          }
        }),
        updating && spinnerOverlay
      ])
    ])
  }

  componentDidUpdate() {
    StateHistory.update(_.pick(
      ['groups', 'filter'],
      this.state)
    )
  }
})


export const addNavPaths = () => {
  Nav.defPath('groups', {
    path: '/groups',
    component: GroupList,
    title: 'Group Management'
  })
}
