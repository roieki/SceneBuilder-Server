const { parse, introspectionQuery, graphqlSync } = require('graphql')
const pluralize = require('pluralize')
const gql = require('graphql-tag')

const ApolloBoost = require('apollo-boost')
const ApolloClient = ApolloBoost.default
const chalk = require('chalk')

const log = msg => {
  console.log(chalk.green(msg))
}

const getServiceIfExist = async (url, ctx, info) => {
  let serviceExists = await ctx.db.exists.SourceService({ url })

  if (!serviceExists) {
    console.error(`service ${url} does not exist`)
    return
  } else {
    return await ctx.db.query.sourceService({ where: { url } }, info)
  }
}

const getSceneIfExist = async (name, ctx, info) => {
  let sceneExists = await ctx.db.exists.Scene({ url })

  if (!sceneExists) {
    console.error(`service ${url} does not exist`)
    return
  } else {
    return await ctx.db.query.Scene({ where: { name } }, info)
  }
}

const getQueriesFromIntrospectionQuery = async (
  client,
  introspecteionQuery
) => {
  let introspecteion = await client.query({ introspecteionQuery })
  let {
    types,
    queryType,
    mutationType,
    subscriptionType
  } = introspecteion.data.__schema
  let objectTypes = types.filter(t => t.kind === 'OBJECT')
  let queryObject = objectTypes.filter(x => x.name === 'Query')
  return queryObject[0].fields.map(x => x.name)
}

const hydrateOverlays = async (logicUrl, overlaysSpec, ctx, info) => {
  // log(
  //   `Creating overlayds for ${
  //     overlaysSpec.overlayName
  //   }. Fetching from ${logicUrl}`
  // )

  log('SPEC', JSON.stringify(overlaysSpec))

  const client = new ApolloClient({
    uri: logicUrl
  })

  let queries = await getQueriesFromIntrospectionQuery(
    client,
    parse(introspectionQuery, { noLocation: true })
  )
  let sourceService = await getServiceIfExist(logicUrl, ctx, info)

  let dataoverlays = overlaysSpec.map(overylay => {
    let { queryName, overlayName } = overlay

    let queryTxt = `
      query {
        ${queryName}${queryParameters}${resultSelection}
      }
    `

    let s = {
      sourceService: { connect: { id: sourceService.id } },
      sourceQuery: queryTxt,
      sourceQueryName: overlaysSpec.overlayName,
      path: overlaysSpec.overlayName,
      name: overlaysSpec.overlayName
    }

    log('WHAT', s)

    return s
  })

  log('Created!!!!!!', dataoverlays)

  return await Promise.all(
    dataoverlays.map(async dataoverlay => {
      console.log('dataoverlay.name', dataoverlay.name)

      let dataOverlayExsists = await ctx.db.exists.DataOverlay({
        name: dataoverlay.name
      })
      if (!semanticLayoutNodeExists) {
        return await ctx.db.mutation.createDataOverlay(
          {
            data: dataoverlay
          },
          info
        )
      } else {
        return await ctx.db.mutation.updateDataOverlay(
          {
            where: {
              name: dataoverlay.name
            },
            data: dataoverlay
          },
          info
        )
      }
    })
  )
}

const getOrCreateSemanticLayoutNode = async (node, ctx, info) => {
  let semanticLayoutNodeExists = await ctx.db.exists.SemanticLayoutNode({
    name: node.name
  })
  if (!semanticLayoutNodeExists) {
    return await ctx.db.mutation.createSemanticLayoutNode(
      {
        data: node
      },
      info
    )
  } else {
    return await ctx.db.mutation.updateSemanticLayoutNode(
      {
        where: {
          name: node.name
        },
        data: node
      },
      info
    )
  }
}

const scene = {
  async hydrateScenes(
    parent,
    { datamodelUrl, logicUrl, scenesSpec },
    ctx,
    info
  ) {
    const client = new ApolloClient({
      uri: datamodelUrl
    })

    let sourceService = await getServiceIfExist(datamodelUrl, ctx)
    let allNodes
    let scenes = await Promise.all(
      scenesSpec.scenes.map(async sceneSpec => {
        log(`Working on ${sceneSpec.name}`)
        let scene
        let sceneName = sceneSpec.name
        let sceneType = sceneSpec.sceneType

        let dataOverlays = []
        let semanticLayoutNodes = []

        //Create the scene if it doesn't exist
        let sceneExists = await ctx.db.exists.Scene({ name: sceneName })

        log('sceneExists', sceneExists)

        if (!sceneExists) {
          scene = await ctx.db.mutation.createScene(
            {
              data: { name: sceneName }
            },
            info
          )
          log(`Created scene: ${sceneSpec.name}`)
        } else {
          scene = await ctx.db.query.scene(
            { where: { name: sceneName } },
            `{
              id
              name
              dataOverlays {
                name
                path
                sourceService { 
                  id
                }
                sourceQuery
                sourceQueryName
              }
              semanticLayoutNodes {
                id
                name
                sourceService { 
                  id
                }
                sourceQuery
                sourceQueryName
              }
              sourceService {
                id
              }
              containerNode {
                name
              }
              cameraSettings {
                id
              }
            }`
          )
          log(`Found scene: ${scene.id} ${JSON.stringify(scene)}`)
        }

        if (sceneSpec.sceneType === 'AGGREGATION') {
          //Query the data service for the first X instances of a type
          log(`${scene.name} is an Aggregation scene.`)
          log(
            `Going over scene types: ${sceneSpec.types
              .map(x => x.name)
              .join(', ')}`
          )

          allNodes = await Promise.all(
            sceneSpec.types.map(async t => {
              let typeName = t.name
              let singularName = pluralize.singular(typeName)
              let pluralName = pluralize.plural(typeName)

              let typeOverlays = t.overlays
              //TODO: Figure out fields

              let queryTxt = `
              query {
                ${pluralName}(first: 1000){
                  id
                }
              }
            `

              let query = gql(queryTxt)

              let result = await client.query({ query })
              let nodes

              if (result.data && result.data[pluralName].length > 0) {
                nodes = result.data[pluralName].map((node, key) => ({
                  name: `${singularName}_${key}`,
                  sourceQuery: `${singularName}({ where: { id: '${
                    node.id
                  }' }}){ id }`,
                  sourceService: { connect: { id: sourceService.id } },
                  sourceQueryName: `${singularName}`
                }))
              }

              let typeSemanticLayoutNodes = await Promise.all(
                nodes.map(async node => {
                  return await getOrCreateSemanticLayoutNode(node, ctx, info)
                })
              )

              //Create semantic nodes for each node in the data set
              semanticLayoutNodes.push(...typeSemanticLayoutNodes)

              log(
                `Adding ${
                  semanticLayoutNodes.length
                } semantic nodes to the queue`
              )

              //Create data overlays if specific for the type
              let typeDataOverlays = typeOverlays.lengh
                ? await hydrateOverlays(logicUrl, typeOverlays, ctx, info)
                : []

              log(
                `Adding ${
                  typeDataOverlays.length
                } data overlays for the type ${typeName} to the queue`
              )

              if (typeDataOverlays.length)
                dataOverlays.push(...typeDataOverlays)
              return typeSemanticLayoutNodes
            })
          )
        } else {
          log(`${scene.name} is a single instance scene. Skipping for now.`)
          //Create a single instance scene
          allNodes = ['wow']
          //TODO: Create single instance scene

          //Create data overlays if specific for the single instance type, if specified
        }

        console.log('1================')
        log(`All nodes: ${JSON.stringify(allNodes)}`)
        console.log('1================')

        // log(`Creating container node for the scene`)
        // // Create Container node for scene
        // let containerNodeSpec = {
        //   name: `$${sceneSpec.name}_${sceneSpec.containerType.name}_container`,
        //   sourceQuery: ``,
        //   sourceService: { connect: { id: sourceService.id } },
        //   sourceQueryName: ``
        // }

        // let containerNode = await getOrCreateSemanticLayoutNode(
        //   containerNodeSpec,
        //   ctx,
        //   info
        // )

        //Create data overlays if specific for the scene, if specified
        log(`Creating scene overlays ${JSON.stringify(sceneSpec)}`)
        let sceneOverlays =
          sceneSpec.overlays && sceneSpec.overlays.length > 0
            ? await hydrateOverlays(scene, logicUrl, sceneSpec.overlays)
            : []
        log(
          `Adding ${
            sceneOverlays.length
          } data overlay for the scene to the queue`
        )
        if (sceneOverlays.length) dataOverlays.push(...sceneOverlays)

        //Associate Nodes with Scene

        let sceneId = scene.id
        delete scene.id

        let updated = {
          ...scene
        }

        if (semanticLayoutNodes.length > 0) {
          updated.semanticLayoutNodes = {
            connect: semanticLayoutNodes.map(node => ({ id: node.id }))
          }
        } else {
          delete updated.semanticLayoutNodes
        }

        log(
          `semanticLayoutNodes -- ${JSON.stringify(
            semanticLayoutNodes
          )} LENGTH: ${semanticLayoutNodes.length}`
        )

        log(
          `dataOverlays -- ${JSON.stringify(dataOverlays)} LENGTH: ${
            dataOverlays.length
          }`
        )

        if (dataOverlays.length > 0) {
          updated.dataOverlays = {
            connect: dataOverlays.map(overlay => ({ id: overlay.id }))
          }
        } else {
          delete updated.dataOverlays
        }

        log(`Updating scene -- ${JSON.stringify(updated)}`)

        try {
          await ctx.db.mutation.updateScene({
            where: { id: sceneId },
            data: updated
          })

          log(`Scene updated!`)

          return updated
        } catch (e) {
          throw new Error(`Operation failed: ${e}`)
        }
      })
    )

    log('Created Scenes', scenes)

    return [
      {
        id: 123
      }
    ]
  }
}

module.exports = { scene }
